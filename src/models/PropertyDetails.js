import { Schema, model } from "mongoose";

const propertyDetailsSchema = new Schema(
  {
    propertyId: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    amenities: {
      type: [String],
      default: [],
    },
    houseRules: {
      type: Schema.Types.Mixed, // Flexible JSON structure
    },
    photos: {
      type: [String],
      default: [],
    },
    videos: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    searchBoost: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default model("PropertyDetails", propertyDetailsSchema);
