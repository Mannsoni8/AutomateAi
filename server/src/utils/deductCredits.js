import userModel from "../model/user.model.js";

export const deductCredits = async ({ userId, credits }) => {
  if (!userId) {
    throw new Error("User ID is required");
  }
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("Credits must be a positive integer");
  }

  const user = await userModel.findOneAndUpdate(
    {
      _id: userId,
      credits: { $gte: credits },
    },
    {
      $inc: {
        credits: -credits,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  if (!user) {
    const existUser = await userModel.exists({ _id: userId });
    if (!existUser) {
      throw new Error("User not found");
    }
    throw new Error("Insufficient Credits");
  }

  return {
    success: true,
    creditsDeducted: credits,
    remainingCredits: user.credits,
  };
};