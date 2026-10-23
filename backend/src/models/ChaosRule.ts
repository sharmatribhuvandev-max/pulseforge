import mongoose, { Document, Schema } from "mongoose";

export interface IChaosRule extends Document {
    endpointId: mongoose.Types.ObjectId;
    enabled: boolean;
    latency: number;
    errorRate: number;
    statusCode: number;
    createdAt: Date;
}

const chaosRuleSchema = new Schema<IChaosRule>(
    {
        endpointId: {
            type: Schema.Types.ObjectId,
            ref: "Endpoint",
            required: true
        },

        enabled: {
            type: Boolean,
            default: false
        },

        latency: {
            type: Number,
            default: 0,
            min: 0
        },

        errorRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },

        statusCode: {
            type: Number,
            default: 500
        }
    },
    {
        timestamps: true
    }
);

export const ChaosRule = mongoose.model<IChaosRule>(
    "ChaosRule",
    chaosRuleSchema
);