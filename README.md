EVENT AUDIT DASHBOARD

**Overview**
    Event Audit Dashboard is a real-time audit logging and monitoring system built to track user actions, system events, and security-related activities within an application.

    The system automatically captures events, enriches them with IP and geo-location data, and presents the information through an admin dashboard designed for analysis, alerts, and audit exports.

    This project is intentionally structured to mirror how production-grade systems handle security logging and observability.

**Key Features**
        Centralized event logging API
        Automatic client IP capture
        Geo-location enrichment
        Secure authentication and authorization
        Admin dashboard with search and filters
        Event analytics using visual charts
        Security alert detection
        CSV export for audits and compliance

**System Roles**
*User*
    Uses the application normally
    Generates events such as login, logout, and API usage
    Has no access to logs or analytics

*Admin*
    Views and filters audit logs
    Analyzes system activity
    Receives alerts for suspicious behavior
    Exports logs for audits and compliance

**Tech Stack**
    Frontend: React.js
    Backend: Node.js, Express.js
    Database: MongoDB
    Authentication: JWT
    Analytics: Chart.js
    Geo-IP: External Geo-IP API

**Project Structure**

event-audit-dashboard/
│
├── backend/
├── frontend/
    ├── user-app/
    └── admin-dashboard/

**Security Considerations**
    Role-based access control
    Input validation and sanitization
    API rate limiting
    Centralized error handling
    Complete audit trail for all actions

**Status**
    This project is under active development and follows a structured, step-by-step implementation approach with a strong focus on real-world system design.