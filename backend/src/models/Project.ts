import mongoose, { Document, Schema } from "mongoose";

export interface IProject extends Document {
    name: string;
    description?: string;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const projectSchema = new Schema<IProject>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            trim: true
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {
        timestamps: true
    }
);

export const Project = mongoose.model<IProject>(
    "Project",
    projectSchema
);