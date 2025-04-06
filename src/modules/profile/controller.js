import { ProfileService } from "./service.js";

export const profileController = {
  /**
   * Get user profile
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getProfile(req, res) {
    try {
      const result = await ProfileService.getProfile(req.user.id);

      if (result.profileExists === false) {
        return res.status(200).json({
          status: "success",
          message: result.message,
          data: {
            user: result.user,
            profile: null,
            requiredFields: result.requiredFields,
          },
        });
      }

      res.json({
        status: "success",
        data: result,
      });
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to retrieve profile",
      });
    }
  },

  /**
   * Create or update profile
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async upsertProfile(req, res) {
    try {
      const profile = await ProfileService.upsertProfile({
        userId: req.user.id,
        profileData: req.body,
      });

      res.status(201).json({
        status: "success",
        data: profile,
      });
    } catch (error) {
      console.error("Profile update failed:", error);

      const status = error.message.startsWith("Validation error") ? 400 : 500;
      res.status(status).json({
        status: "error",
        message: error.message || "Failed to update profile",
      });
    }
  },

  /**
   * Partial profile update
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async partialUpdate(req, res) {
    try {
      const updatedProfile = await ProfileService.partialUpdate(
        req.user.id,
        req.body
      );

      res.json({
        status: "success",
        data: updatedProfile,
      });
    } catch (error) {
      console.error("Partial update failed:", error);

      const status = error.message.startsWith("Validation error") ? 400 : 500;
      res.status(status).json({
        status: "error",
        message: error.message || "Failed to update profile",
      });
    }
  },

  /**
   * Update profile picture
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async updateProfilePicture(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message: "No image file provided",
        });
      }

      const updatedProfile = await ProfileService.updateProfilePicture({
        userId: req.user.id,
        imageBuffer: req.file.buffer,
      });

      res.json({
        status: "success",
        data: updatedProfile,
      });
    } catch (error) {
      console.error("Profile picture update failed:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to update profile picture",
      });
    }
  },

  /**
   * Update notification preferences
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async updateNotificationPreferences(req, res) {
    try {
      const updatedProfile = await ProfileService.updateNotificationPreferences(
        {
          userId: req.user.id,
          preferences: req.body,
        }
      );

      res.json({
        status: "success",
        data: updatedProfile,
      });
    } catch (error) {
      console.error("Notification preferences update failed:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to update notification preferences",
      });
    }
  },

  /**
   * Search profiles
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async searchProfiles(req, res) {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const profiles = await ProfileService.searchProfiles(
        req.query,
        parseInt(limit),
        parseInt(offset)
      );

      res.json({
        status: "success",
        data: profiles,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: profiles.length,
        },
      });
    } catch (error) {
      console.error("Profile search failed:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to search profiles",
      });
    }
  },

  /**
   * Delete profile
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async deleteProfile(req, res) {
    try {
      await ProfileService.deleteProfile(req.user.id);
      res.status(204).end();
    } catch (error) {
      console.error("Profile deletion failed:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to delete profile",
      });
    }
  },
};
