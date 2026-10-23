import mongoose, { Document, Schema } from "mongoose";

export interface IEndpoint extends Document {
    projectId: mongoose.Types.ObjectId;
    name: string;
    url: string;
    method: string;
    createdAt: Date;
}

const endpointSchema = new Schema<IEndpoint>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        url: {
            type: String,
            required: true,
            trim: true
        },

        method: {
            type: String,
            required: true,
            uppercase: true
        }
    },
    {
        timestamps: true
    }
);

export const Endpoint = mongoose.model<IEndpoint>(
    "Endpoint",
    endpointSchema
);