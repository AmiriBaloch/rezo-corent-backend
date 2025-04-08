import prisma from "../config/database.js";
import redis from "../config/redis.js";
import logger from "../config/logger.js";
import Message from "../models/Message.js";
import ConversationCache from "../models/ConversationCache.js";
import { ChatEvents } from "./events.js";

export const handleChatEvents = (ws, userId) => {
  ws.on("message", async (rawData) => {
    try {
      const { event, payload } = JSON.parse(rawData);

      switch (event) {
        case ChatEvents.SEND_MESSAGE:
          await handleSendMessage(userId, payload);
          break;

        case ChatEvents.MESSAGE_DELIVERED:
          await handleMessageDelivered(userId, payload);
          break;

        case ChatEvents.MESSAGE_READ:
          await handleMessageRead(userId, payload);
          break;

        case ChatEvents.MESSAGE_REACTION:
          await handleMessageReaction(userId, payload);
          break;

        case ChatEvents.EDIT_MESSAGE:
          await handleEditMessage(userId, payload);
          break;

        case ChatEvents.DELETE_MESSAGE:
          await handleDeleteMessage(userId, payload);
          break;

        case ChatEvents.TYPING_INDICATOR:
          await handleTypingIndicator(userId, payload);
          break;

        case ChatEvents.JOIN_CONVERSATION:
          await handleJoinConversation(userId, payload);
          break;

        case ChatEvents.LEAVE_CONVERSATION:
          await handleLeaveConversation(userId, payload);
          break;
      }
    } catch (error) {
      logger.error("Chat socket error:", error);
      ws.send(
        JSON.stringify({
          event: ChatEvents.MESSAGE_ERROR,
          payload: { error: error.message },
        })
      );
    }
  });
};



async function handleSendMessage(
  senderId,
  { conversationId, content, attachments }
) {
  // 1. Create message in PostgreSQL (metadata)
  const pgMessage = await prisma.messageMetadata.create({
    data: {
      conversation: { connect: { id: conversationId } },
      sender: { connect: { id: senderId } },
      status: "SENT",
    },
  });

  // 2. Create in MongoDB (rich content)
  const mongoMessage = new Message({
    messageId: pgMessage.id,
    conversationId,
    senderId,
    content,
    attachments,
    status: "sent",
  });
  await mongoMessage.save();

  // 3. Update conversation cache
  await ConversationCache.findOneAndUpdate(
    { conversationId },
    { $set: { updatedAt: new Date() } },
    { upsert: true }
  ).then(async (conversation) => {
    if (conversation) {
      await conversation.updateLastMessage(mongoMessage);
    }
  });

  // 4. Publish to Redis
  const messagePayload = {
    ...mongoMessage.toObject(),
    pgCreatedAt: pgMessage.sentAt,
    pgUpdatedAt: pgMessage.sentAt,
  };

  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({
      event: ChatEvents.NEW_MESSAGE,
      payload: messagePayload,
    })
  );

  // 5. Notify participants
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });

  participants.forEach(({ userId }) => {
    if (userId !== senderId) {
      redis.publish(
        `user:${userId}:notifications`,
        JSON.stringify({
          event: "NEW_CHAT_MESSAGE",
          payload: {
            conversationId,
            messageId: pgMessage.id,
            senderId,
            preview: content.text?.substring(0, 100) || "[Attachment]",
          },
        })
      );
    }
  });
}

async function handleMessageDelivered(userId, { messageIds }) {
  // Update both databases
  await Promise.all([
    prisma.messageMetadata.updateMany({
      where: { id: { in: messageIds }, status: "SENT" },
      data: { status: "DELIVERED" },
    }),
    Message.updateMany(
      { messageId: { $in: messageIds }, status: "sent" },
      { $set: { status: "delivered" } }
    ),
  ]);

  // Notify senders
  const messages = await Message.find({ messageId: { $in: messageIds } });
  const uniqueSenders = [...new Set(messages.map((m) => m.senderId))];

  await Promise.all(
    uniqueSenders.map((senderId) =>
      redis.publish(
        `user:${senderId}:messages`,
        JSON.stringify({
          event: ChatEvents.MESSAGES_DELIVERED,
          payload: { messageIds, confirmedBy: userId },
        })
      )
    )
  );
}

async function handleTypingIndicator(userId, { conversationId, isTyping }) {
  // Update presence record
  await Presence.findOneAndUpdate(
    { userId },
    { typingIn: isTyping ? conversationId : null }
  );

  // Broadcast to conversation participants
  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({
      event: ChatEvents.TYPING_INDICATOR,
      payload: { userId, isTyping },
    })
  );
}

async function handleMessageRead(userId, { messageIds }) {
  // Update both databases
  await Promise.all([
    prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data: { status: "read" },
    }),
    Message.updateMany(
      { messageId: { $in: messageIds } },
      { $set: { status: "read" } }
    ),
  ]);

  // Notify sender about read receipt
  const messages = await Message.find({ messageId: { $in: messageIds } });
  const uniqueSenders = [...new Set(messages.map((m) => m.senderId))];

  await Promise.all(
    uniqueSenders.map((senderId) =>
      redis.publish(
        `chat:${senderId}`,
        JSON.stringify({
          event: "MESSAGES_READ",
          payload: { messageIds, readBy: userId },
        })
      )
    )
  );
}

async function handleMessageReaction(userId, { messageId, emoji }) {
  const reaction = {
    userId,
    emoji,
    createdAt: new Date(),
  };

  const updatedMessage = await Message.findOneAndUpdate(
    { messageId },
    { $push: { reactions: reaction } },
    { new: true }
  );

  await redis.publish(
    `chat:${updatedMessage.conversationId}`,
    JSON.stringify({
      event: "MESSAGE_REACTION",
      payload: {
        messageId,
        reaction,
      },
    })
  );
}

async function handleEditMessage(userId, { messageId, newContent }) {
  const updatedMessage = await Message.findOneAndUpdate(
    { messageId, senderId: userId },
    {
      $set: { "content.text": newContent },
      $push: {
        edits: {
          content: newContent,
          editedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  if (updatedMessage) {
    await redis.publish(
      `chat:${updatedMessage.conversationId}`,
      JSON.stringify({
        event: "MESSAGE_EDITED",
        payload: {
          messageId,
          newContent,
          editedAt: updatedMessage.edits.slice(-1)[0].editedAt,
        },
      })
    );
  }
}

async function handleDeleteMessage(userId, { messageId }) {
  const updatedMessage = await Message.findOneAndUpdate(
    { messageId },
    {
      $set: {
        "deleted.isDeleted": true,
        "deleted.deletedAt": new Date(),
        "deleted.deletedBy": userId,
      },
    },
    { new: true }
  );

  if (updatedMessage) {
    await redis.publish(
      `chat:${updatedMessage.conversationId}`,
      JSON.stringify({
        event: "MESSAGE_DELETED",
        payload: { messageId, deletedBy: userId },
      })
    );
  }
}
