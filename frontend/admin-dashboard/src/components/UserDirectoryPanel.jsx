import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";

function UserDirectoryPanel() {
  const { API, token } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedSummary = useMemo(
    () => users.find((user) => user._id === selectedUserId) || null,
    [users, selectedUserId]
  );

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await API.get("/api/auth/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rows = Array.isArray(data?.users) ? data.users : [];
        setUsers(rows);
        if (rows[0]?._id) setSelectedUserId(rows[0]._id);
      } catch (_error) {
        setError("Failed to load users.");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [API, token]);

  useEffect(() => {
    if (!selectedUserId) return;
    const fetchUserDetails = async () => {
      setDetailsLoading(true);
      try {
        const { data } = await API.get(`/api/auth/admin/users/${selectedUserId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSelectedUser(data?.user || null);
      } catch (_error) {
        setSelectedUser(null);
      } finally {
        setDetailsLoading(false);
      }
    };
    fetchUserDetails();
  }, [API, token, selectedUserId]);

  if (loading) return <div style={{ color: "var(--text-secondary)" }}>Loading users...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div className="users-layout-grid">
      <article className="users-card">
        <h4 className="users-card-title">All Users</h4>
        <div className="users-list-scroll">
          {users.map((user) => (
            <button
              key={user._id}
              type="button"
              className={`user-row-btn ${selectedUserId === user._id ? "active" : ""}`}
              onClick={() => setSelectedUserId(user._id)}
            >
              <div className="user-row-head">
                <span>{user.name}</span>
                <span className="user-role-chip">{String(user.role || "").toUpperCase()}</span>
              </div>
              <div className="user-row-meta">{user.email}</div>
            </button>
          ))}
        </div>
      </article>

      <article className="users-card">
        <h4 className="users-card-title">Selected User Details</h4>
        {!selectedSummary && <div style={{ color: "var(--text-secondary)" }}>Select a user to view details.</div>}
        {selectedSummary && (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {detailsLoading ? (
              <div style={{ color: "var(--text-secondary)" }}>Loading user details...</div>
            ) : (
              <UserDetailRows user={selectedUser || selectedSummary} />
            )}
          </div>
        )}
      </article>

      <article className="users-card">
        <h4 className="users-card-title">Last 10 Actions</h4>
        <UserRecentActions actions={selectedUser?.recentActions} />
      </article>
    </div>
  );
}

function UserDetailRows({ user }) {
  const rows = [
    { label: "User ID", value: user?._id },
    { label: "Name", value: user?.name },
    { label: "Email", value: user?.email },
    { label: "Role", value: user?.role },
    { label: "Risk Score", value: Number(user?.riskScore || 0) },
    { label: "Provider", value: user?.provider || "local" },
    {
      label: "Known Devices",
      value: Array.isArray(user?.knownDevices) ? user.knownDevices.length : Number(user?.knownDevicesCount || 0),
    },
    { label: "Created By", value: user?.createdBy || "system" },
    { label: "Updated By", value: user?.updatedBy || "system" },
    { label: "Created At", value: user?.createdAt ? new Date(user.createdAt).toLocaleString() : "N/A" },
    { label: "Updated At", value: user?.updatedAt ? new Date(user.updatedAt).toLocaleString() : "N/A" },
  ];

  return (
    <div className="user-detail-grid">
      {rows.map((row) => (
        <div key={row.label} className="user-detail-item">
          <div className="user-detail-label">{row.label}</div>
          <div className="user-detail-value">{String(row.value ?? "N/A")}</div>
        </div>
      ))}
    </div>
  );
}

function UserRecentActions({ actions }) {
  const rows = Array.isArray(actions) ? actions : [];
  if (!rows.length) return <div style={{ color: "var(--text-secondary)" }}>No recent actions for this user.</div>;

  return (
    <div style={{ overflowX: "hidden" }}>
      <table style={{ width: "100%", tableLayout: "auto" }}>
        <thead>
          <tr>
            <th>Event</th>
            <th>Endpoint</th>
            <th>IP</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((action) => (
            <tr key={action._id}>
              <td style={cellClampStyle}>{action.eventType || "-"}</td>
              <td style={cellClampStyle}>{action.endpoint || "-"}</td>
              <td style={cellClampStyle}>{action.ipAddress || "-"}</td>
              <td style={cellClampStyle}>{action.createdAt ? new Date(action.createdAt).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellClampStyle = {
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.35,
  padding: "0.65rem 0.55rem",
};

export default UserDirectoryPanel;
