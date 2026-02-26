import mongoose from "mongoose";

const mcpToolAuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    toolName: { type: String, required: true },
    input: { type: Object, default: {} },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "mcp_tool_audit_logs" }
);

export default mongoose.model("McpToolAuditLog", mcpToolAuditLogSchema);

