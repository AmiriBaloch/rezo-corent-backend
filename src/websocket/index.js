import { initializeSocket } from './socketManager.js';

let ioInstance = null;

export function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}

export function setupWebSocket(server) {
  ioInstance = initializeSocket(server);
  return ioInstance;
}