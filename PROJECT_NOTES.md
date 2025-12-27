PROJECT NOTES – EVENT AUDIT DASHBOARD

1. **Project Purpose**

    The goal of this project is to build a centralized audit logging and monitoring system that records everything important happening inside an application.

    Every meaningful user action, system event, or security-related activity is automatically captured. These events are enriched with IP address and geo-location data, stored securely, and later visualized through an admin dashboard.

    The dashboard helps administrators analyze system behavior, investigate issues, receive alerts, and export audit logs when required.

    This document acts as my internal reference while designing and implementing the system.

2. **Actors and Roles**

USER
    Uses the application normally
    Generates events such as login, logout, and API usage
    Has no visibility into logs, analytics, or alerts

ADMIN
    Has full visibility into audit logs
    Can search, filter, and analyze events
    Views charts and analytics
    Exports logs for audits or compliance
    Receives and manages security alerts

3. **Event Taxonomy**

Authentication Events
    LOGIN_SUCCESS
    LOGIN_FAILED
    LOGOUT
    TOKEN_REFRESH
    PASSWORD_CHANGE

User Activity Events
    PROFILE_UPDATE
    SETTINGS_UPDATE
    USER_ACTION

System & API Events
    API_REQUEST
    API_ERROR
    RATE_LIMIT_EXCEEDED
    VALIDATION_FAILED

Admin Events
    LOG_VIEWED
    LOG_FILTERED
    LOG_EXPORTED
    ALERT_ACKNOWLEDGED

Security & Alert Events
    MULTIPLE_LOGIN_FAILURES
    SUSPICIOUS_IP_ACTIVITY
    UNUSUAL_LOCATION_LOGIN

4. **Event Lifecycle (System Flow)**

        1. The system follows a consistent flow for every event:
        2. A user or admin performs an action
        3. The corresponding API endpoint is triggered
        4. Authentication middleware validates access
        5. Event logger middleware records the event
        6. Client IP address is captured automatically
        7. Geo-IP lookup resolves location details
        8. Event data is stored in the database
        9. Analytics and alert rules are evaluated
        10. Admin dashboard fetches and displays insights

5. **Mandatory Event Data Fields**

Every stored event must include the following fields to ensure traceability and audit readiness:
            eventType (from predefined taxonomy)
            userId (nullable for unauthenticated events)
            ipAddress
            geoLocation
            country
            region
            city
            timestamp
            metadata
            endpoint
            HTTP method
            browser or client
            failure reason (if applicable)
            createdBy (system, user, or admin)

6. **Alerts Philosophy**
    Alerts are not treated separately from events.
    Instead, alerts are derived from existing events and stored as events themselves.

*Example:*
Multiple LOGIN_FAILED events from the same IP result in a
MULTIPLE_LOGIN_FAILURES security event.

    This approach ensures that alerts remain fully auditable and traceable.

7. **Frontend Separation**

*User App*
    Exists only to perform normal user operations and generate real events.

*Admin Dashboard*
    Used strictly for viewing logs, filtering data, analytics, and exports.

There is no shared business logic between the two.

8. **Non-Functional Standards**
        Authentication and authorization everywhere
        Role-based access control for admin features
        Strict input validation on all APIs
        Centralized error handling
        API request logging
        Rate limiting and sanitization
        Pagination and filtering for large datasets
        Audit fields on all database writes

9. **Scope Control**

This system is intentionally limited to monitoring, auditing, and analytics.

It does not implement business workflows or end-user features beyond what is necessary to generate events