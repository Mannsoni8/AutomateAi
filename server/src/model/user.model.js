import mongoose from "mongoose";
const userShema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    profilePicture: {
      type: String,
      default: "",
    },
    credits: {
      type: Number,
      default: 100,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

const userModel = mongoose.model("User", userShema);

export default userModel;
