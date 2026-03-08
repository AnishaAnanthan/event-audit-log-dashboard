import { useContext, useEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

function DashboardLayout() {
  const { admin, logout, API, token } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboardHome = location.pathname === "/";
  const isImportPage = location.pathname.startsWith("/log-import");
  const isLogsPage = location.pathname.startsWith("/logs");
  const isAlertsPage = location.pathname.startsWith("/alerts");
  const useDarkShell = isDashboardHome || isImportPage || isLogsPage || isAlertsPage;
  const [profileOpen, setProfileOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const profileRef = useRef(null);

  const navItems = [
    { label: "Dashboard", path: "/" },
    { label: "Log Import", path: "/log-import" },
    { label: "Audit Logs", path: "/logs" },
    { label: "Alerts", path: "/alerts" },
  ];

  const isActivePath = (path) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm("Delete this admin account permanently?");
    if (!confirmed) return;
    try {
      setDeleting(true);
      await API.delete("/api/auth/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      await logout();
      navigate("/login");
    } catch (error) {
      alert(error?.response?.data?.message || "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`dashboard-layout ${useDarkShell ? "dashboard-layout-dark" : ""}`}>
      <aside className={`sidebar ${useDarkShell ? "sidebar-dark" : ""}`}>
        <div className="sidebar-brand-wrap">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <h2 className="sidebar-brand-title">Admin<span style={{ color: "var(--primary-color)" }}>Dash</span></h2>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <ul className="sidebar-nav-list">
            {navItems.map((item) => (
              <li key={item.path} className="sidebar-nav-item">
                <Link 
                  to={item.path}
                  className={`${isActivePath(item.path) ? "sidebar-link active" : "sidebar-link"} ${item.label === "Audit Logs" ? "sidebar-link-icon-only" : ""}`}
                  title={item.label}
                >
                  {item.label === "Dashboard" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>}
                  {item.label === "Log Import" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>}
                  {item.label === "Audit Logs" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>}
                  {item.label === "Alerts" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>}
                  {item.label !== "Audit Logs" ? item.label : <span className="sr-only-text">Audit Logs</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button onClick={logout} className="sidebar-logout-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Logout
          </button>
        </div>
      </aside>

      <main className={`main-content ${useDarkShell ? "main-content-dark-dashboard" : ""}`}>
        <header className={`topbar ${useDarkShell ? "topbar-dark" : ""}`}>
          <h1 className="topbar-title">
            {navItems.find((i) => isActivePath(i.path))?.label || "Dashboard"}
          </h1>
          
          <div className="topbar-profile" ref={profileRef}>
            <button
              type="button"
              className="topbar-user-wrap topbar-user-button"
              onClick={() => setProfileOpen((value) => !value)}
            >
              <div style={{ textAlign: "right" }}>
                <div className="topbar-user-name">{admin?.name}</div>
                <div className="topbar-user-role">Administrator</div>
              </div>
              <div className="topbar-avatar">
                {admin?.name?.charAt(0).toUpperCase()}
              </div>
            </button>
            {profileOpen && (
              <div className="profile-popover">
                <div className="profile-popover-title">{admin?.name}</div>
                <div className="profile-popover-sub">Role: {admin?.role || "admin"}</div>
                <div className="profile-popover-sub">Email: {admin?.email || "N/A"}</div>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="profile-popover-delete-btn"
                >
                  {deleting ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            )}
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;
