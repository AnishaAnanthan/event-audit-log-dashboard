import Event from "../models/event.model.js";
import getGeoLocation from "./geoIp.service.js";

/**
 * A reusable service to log any event.
 * @param {string} eventType - The type of event (e.g., 'LOGIN_FAILED').
 * @param {object} req - The Express request object to extract IP, endpoint, etc.
 * @param {object|null} user - The user object, if available (contains userId, role).
 */
export const logEvent = async (eventType, req, user = null) => {
  try {
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    const geoLocation = await getGeoLocation(ipAddress);

    const eventData = {
      eventType,
      userId: user ? user._id || user.userId : null,
      ipAddress,
      endpoint: req.originalUrl,
      method: req.method,
      createdBy: user ? user.role : "system",
    };

    if (geoLocation) {
      eventData.geoLocation = geoLocation;
    }

    await Event.create(eventData);
  } catch (error) {
    console.error("Event logging failed:", error.message);
  }
};