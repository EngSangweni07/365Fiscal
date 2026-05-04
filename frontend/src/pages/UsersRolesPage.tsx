import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchWithTotal } from "../api";
import { TablePagination } from "../components/TablePagination";
import { useMe } from "../hooks/useMe";

interface Role {
  id: number;
  name: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
  level: number;
  can_create_companies: boolean;
  can_edit_companies: boolean;
  can_create_users: boolean;
  can_edit_users: boolean;
  can_create_products: boolean;
  can_edit_products: boolean;
  can_create_invoices: boolean;
  can_edit_invoices: boolean;
  can_confirm_invoices: boolean;
  can_fiscalize_invoices: boolean;
  can_create_quotations: boolean;
  can_convert_quotations: boolean;
  can_create_credit_notes: boolean;
  can_record_payments: boolean;
  can_configure_fiscal_devices: boolean;
  can_view_audit_logs: boolean;
  can_view_fiscal_reports: boolean;
}

interface CompanyUser {
  id: number;
  user_id: number;
  company_id: number;
  role: string;
  role_id: number | null;
  is_active: boolean;
  is_company_admin: boolean;
  user?: {
    id: number;
    email: string;
    is_active: boolean;
  };
}

interface User {
  id: number;
  email: string;
  is_active: boolean;
  is_admin: boolean;
}

// Icons
const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function UsersRolesPage() {
  const { me } = useMe();
  const companyId = me?.company_ids?.[0];
  const isSystemAdmin = Boolean(me?.is_admin);

  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [roles, setRoles] = useState<Role[]>([]);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [totalCompanyUsers, setTotalCompanyUsers] = useState(0);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New user form
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("sales_user");
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(10);

  // Selected role for viewing
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  useEffect(() => {
    loadData();
  }, [companyId, usersPage, usersPageSize]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const userParams = new URLSearchParams();
      if (companyId) userParams.set("company_id", String(companyId));
      userParams.set("limit", String(usersPageSize));
      userParams.set("offset", String((usersPage - 1) * usersPageSize));
      const [rolesData, usersResult] = await Promise.all([
        apiFetch<Role[]>("/roles"),
        companyId
          ? apiFetchWithTotal<CompanyUser[]>(`/company-users?${userParams.toString()}`)
          : Promise.resolve({ data: [] as CompanyUser[], total: 0 }),
      ]);
      setRoles(rolesData);
      setCompanyUsers(usersResult.data);
      setTotalCompanyUsers(usersResult.total);
      
      if (isSystemAdmin) {
        const allUsersData = await apiFetch<User[]>("/users");
        setAllUsers(allUsersData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword || !companyId) return;

    try {
      // Create user first
      const newUser = await apiFetch<User>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          is_admin: false,
          is_active: true,
        }),
      });

      // Link to company with role
      const role = roles.find(r => r.name === newUserRole);
      await apiFetch("/company-users", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          user_id: newUser.id,
          role: newUserRole,
          role_id: role?.id || null,
          is_active: true,
          is_company_admin: newUserRole === "company_admin",
        }),
      });

      setShowNewUser(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("sales_user");
      loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
  };

  const handleUpdateUserRole = async (companyUser: CompanyUser, newRole: string) => {
    try {
      const role = roles.find(r => r.name === newRole);
      await apiFetch(`/company-users/${companyUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: newRole,
          role_id: role?.id || null,
          is_company_admin: newRole === "company_admin",
        }),
      });
      loadData();
    } catch (err: any) {
      setError(err.message || "Failed to update user role");
    }
  };

  const handleToggleUserActive = async (companyUser: CompanyUser) => {
    try {
      await apiFetch(`/company-users/${companyUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          is_active: !companyUser.is_active,
        }),
      });
      loadData();
    } catch (err: any) {
      setError(err.message || "Failed to update user status");
    }
  };

  const getRoleBadgeColor = (roleName: string) => {
    const colors: Record<string, string> = {
      system_admin: "var(--red-600)",
      company_admin: "var(--violet-600)",
      accountant: "var(--blue-600)",
      sales_user: "var(--green-600)",
      inventory_manager: "var(--orange-600)",
      read_only: "var(--slate-500)",
    };
    return colors[roleName] || "var(--slate-500)";
  };

  const usersTotalPages = Math.max(
    1,
    Math.ceil(totalCompanyUsers / usersPageSize),
  );
  const pagedCompanyUsers = useMemo(() => companyUsers, [companyUsers]);

  useEffect(() => {
    setUsersPage((prev) => Math.min(prev, usersTotalPages));
  }, [usersTotalPages]);

  useEffect(() => {
    setUsersPage(1);
  }, [activeTab, companyId, usersPageSize]);

  if (loading) {
    return (
      <div className="content-area">
        <div className="page-header">
          <h1 className="page-title">Users & Roles</h1>
        </div>
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="page-header">
        <h1 className="page-title">Users & Roles</h1>
        <p className="page-subtitle">Manage company users and their access permissions</p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>×</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-nav" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <UserIcon /> Company Users
        </button>
        <button
          className={`tab-btn ${activeTab === "roles" ? "active" : ""}`}
          onClick={() => setActiveTab("roles")}
        >
          <ShieldIcon /> Roles & Permissions
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="users-section">
          <div className="section-header">
            <h2>Company Users</h2>
            <button className="btn btn-primary" onClick={() => setShowNewUser(true)}>
              <PlusIcon /> Add User
            </button>
          </div>

          {/* New User Form */}
          {showNewUser && (
            <div className="card" style={{ marginBottom: 20, padding: 20 }}>
              <h3 style={{ marginBottom: 16 }}>Add New User</h3>
              <div className="form-row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                  <label>Role</label>
                  <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                    {roles.filter(r => r.name !== "system_admin").map((role) => (
                      <option key={role.id} value={role.name}>
                        {role.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleCreateUser}>
                  Create User
                </button>
                <button className="btn btn-secondary" onClick={() => setShowNewUser(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Users List */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedCompanyUsers.map((cu) => (
                  <tr key={cu.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          className="avatar-small"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "var(--slate-200)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {cu.user?.email?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <span>{cu.user?.email || `User #${cu.user_id}`}</span>
                      </div>
                    </td>
                    <td>
                      <select
                        value={cu.role}
                        onChange={(e) => handleUpdateUserRole(cu, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--slate-200)",
                          background: getRoleBadgeColor(cu.role) + "20",
                          color: getRoleBadgeColor(cu.role),
                          fontWeight: 600,
                        }}
                      >
                        {roles.filter(r => r.name !== "system_admin").map((role) => (
                          <option key={role.id} value={role.name}>
                            {role.display_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${cu.is_active ? "status-active" : "status-inactive"}`}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: cu.is_active ? "var(--green-100)" : "var(--red-100)",
                          color: cu.is_active ? "var(--green-600)" : "var(--red-600)",
                        }}
                      >
                        {cu.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleToggleUserActive(cu)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          background: cu.is_active ? "var(--red-100)" : "var(--green-100)",
                          color: cu.is_active ? "var(--red-600)" : "var(--green-600)",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                        }}
                      >
                        {cu.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={usersPage}
              pageSize={usersPageSize}
              totalItems={totalCompanyUsers}
              onPageChange={setUsersPage}
              onPageSizeChange={setUsersPageSize}
            />
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === "roles" && (
        <div className="roles-section">
          <div className="roles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {roles.map((role) => (
              <div
                key={role.id}
                className="role-card card"
                style={{
                  padding: 20,
                  cursor: "pointer",
                  border: selectedRole?.id === role.id ? "2px solid var(--blue-500)" : "1px solid var(--slate-200)",
                }}
                onClick={() => setSelectedRole(selectedRole?.id === role.id ? null : role)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: getRoleBadgeColor(role.name) + "20",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: getRoleBadgeColor(role.name),
                    }}
                  >
                    <ShieldIcon />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{role.display_name}</h3>
                    <span style={{ fontSize: 12, color: "var(--slate-500)" }}>Level: {role.level}</span>
                  </div>
                  {role.is_system_role && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--slate-100)",
                        color: "var(--slate-500)",
                      }}
                    >
                      SYSTEM
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--slate-500)", margin: 0 }}>{role.description}</p>

                {/* Expanded permissions view */}
                {selectedRole?.id === role.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--slate-200)" }}>
                    <h4 style={{ fontSize: 13, marginBottom: 12, color: "var(--slate-700)" }}>Permissions</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[
                        { key: "can_create_invoices", label: "Create Invoices" },
                        { key: "can_confirm_invoices", label: "Confirm Invoices" },
                        { key: "can_fiscalize_invoices", label: "Fiscalize Invoices" },
                        { key: "can_create_quotations", label: "Create Quotations" },
                        { key: "can_convert_quotations", label: "Convert Quotations" },
                        { key: "can_create_credit_notes", label: "Create Credit Notes" },
                        { key: "can_record_payments", label: "Record Payments" },
                        { key: "can_configure_fiscal_devices", label: "Configure Devices" },
                        { key: "can_view_audit_logs", label: "View Audit Logs" },
                        { key: "can_create_users", label: "Create Users" },
                      ].map((perm) => (
                        <div
                          key={perm.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            color: (role as any)[perm.key] ? "var(--green-600)" : "var(--slate-400)",
                          }}
                        >
                          {(role as any)[perm.key] ? <CheckIcon /> : <XIcon />}
                          {perm.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .tab-nav {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--slate-200);
          padding-bottom: 0;
        }
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--slate-500);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tab-btn:hover {
          color: var(--slate-800);
        }
        .tab-btn.active {
          color: var(--blue-500);
          border-bottom-color: var(--blue-500);
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .section-header h2 {
          margin: 0;
          font-size: 18px;
        }
        .alert-error {
          background: var(--red-100);
          color: var(--red-600);
          padding: 12px 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .loading-spinner {
          display: flex;
          justify-content: center;
          padding: 40px;
          color: var(--slate-500);
        }
      `}</style>
    </div>
  );
}
