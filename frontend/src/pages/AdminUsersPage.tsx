import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchWithTotal } from "../api";
import { TablePagination } from "../components/TablePagination";
import { useAlert } from "../context/AlertContext";

type User = {
  id: number;
  email: string;
  is_admin: boolean;
  is_active: boolean;
};

// Icons
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const KeyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ToggleOnIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/>
  </svg>
);

const ToggleOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="8" cy="12" r="3"/>
  </svg>
);

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [totalAdmins, setTotalAdmins] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { showConfirm } = useAlert();

  const loadUsers = async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      params.set("is_admin", "true");
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const { data, total } = await apiFetchWithTotal<User[]>(
        `/users?${params.toString()}`,
      );
      setAdmins(data);
      setTotalAdmins(total);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, pageSize]);

  const createAdmin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    try {
      setError(null);
      setStatus(null);
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ email, password, is_admin: true })
      });
      setStatus("Admin user created successfully");
      setEmail("");
      setPassword("");
      loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to create admin");
    }
  };

  const toggleActive = async (user: User) => {
    try {
      setError(null);
      await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active })
      });
      loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    }
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm({ email: user.email, password: "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ email: "", password: "" });
  };

  const saveEdit = async (userId: number) => {
    try {
      setError(null);
      const updates: any = {};
      if (editForm.email) updates.email = editForm.email;
      if (editForm.password) updates.password = editForm.password;
      
      if (Object.keys(updates).length === 0) {
        cancelEdit();
        return;
      }
      
      await apiFetch(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      setStatus("User updated successfully");
      cancelEdit();
      loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    }
  };

  const deleteUser = async (userId: number) => {
    const confirmed = await showConfirm({
      title: "Delete admin user",
      message:
        "Are you sure you want to delete this admin user? This action cannot be undone.",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      setError(null);
      await apiFetch(`/users/${userId}`, { method: "DELETE" });
      setStatus("User deleted successfully");
      loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to delete user");
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalAdmins / pageSize));
  const pagedAdmins = useMemo(() => admins, [admins]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <h3>Admin Users</h3>
          <p className="card-subtitle">Manage administrator accounts for the system</p>
        </div>
        
        <div className="form-section">
          <h4 className="form-section-title">Add New Administrator</h4>
          <div className="form-row">
            <label className="input flex-2">
              Email Address
              <input
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="input flex-1">
              Password
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button className="primary icon-btn" onClick={createAdmin}>
                <PlusIcon />
                Add Admin
              </button>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {status && <div className="alert alert-success">{status}</div>}

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">
                    <p>No administrators found</p>
                    <span>Add your first admin user above</span>
                  </td>
                </tr>
              ) : (
                pagedAdmins.map((user) => (
                  <tr key={user.id} className={editingId === user.id ? "editing" : ""}>
                    <td>
                      {editingId === user.id ? (
                        <div className="edit-fields">
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            placeholder="Email"
                            className="edit-input"
                          />
                          <input
                            type="password"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            placeholder="New password (optional)"
                            className="edit-input"
                          />
                        </div>
                      ) : (
                        <span className="user-email">{user.email}</span>
                      )}
                    </td>
                    <td>
                      <span 
                        className={`status-badge clickable ${user.is_active ? "active" : "inactive"}`}
                        onClick={() => toggleActive(user)}
                        title={user.is_active ? "Click to deactivate" : "Click to activate"}
                      >
                        {user.is_active ? <ToggleOnIcon /> : <ToggleOffIcon />}
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {editingId === user.id ? (
                          <>
                            <button className="icon-btn success" onClick={() => saveEdit(user.id)} title="Save changes">
                              <CheckIcon />
                            </button>
                            <button className="icon-btn ghost" onClick={cancelEdit} title="Cancel">
                              <XIcon />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="icon-btn ghost" onClick={() => startEdit(user)} title="Edit user">
                              <EditIcon />
                            </button>
                            <button className="icon-btn ghost" onClick={() => {
                              setEditingId(user.id);
                              setEditForm({ email: user.email, password: "" });
                            }} title="Change password">
                              <KeyIcon />
                            </button>
                            <button className="icon-btn danger-ghost" onClick={() => deleteUser(user.id)} title="Delete user">
                              <TrashIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={totalAdmins}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </div>
  );
}
