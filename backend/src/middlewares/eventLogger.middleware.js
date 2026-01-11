import Event from "../models/event.model.js";
import getGeoLocation from "../utils/geoIp.util.js";

const eventLogger = (eventType) => {
  return async (req, res, next) => {
    try {
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress;

      const geoLocation = await getGeoLocation(ip);

      await Event.create({
        eventType,
        userId: req.user?.userId || null,
        ipAddress: ip,
        geoLocation,
        endpoint: req.originalUrl,
        method: req.method,
        metadata: {
          body: req.body,
          params: req.params
        },
        createdBy: req.user?.role || "system"
      });

      next();
    } catch (error) {
      next(); 
    }
  };
};

export default eventLogger;
