import axios from "axios";

const normalizeIp = (ip = "") => ip.replace("::ffff:", "").trim();

const isPrivateIP = (ip) => {
  if (!ip) return true;
  const normalized = normalizeIp(ip);

  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
};

const getGeoLocation = async (ipAddress) => {
  try {
    if (isPrivateIP(ipAddress)) {
      return {
        country: "LOCAL",
        region: "LOCAL",
        city: "LOCAL",
      };
    }

    const apiKey = process.env.GEO_IP_API_KEY;
    if (!apiKey) {
      return null;
    }

    const response = await axios.get(`http://api.ipstack.com/${normalizeIp(ipAddress)}`, {
      params: { access_key: apiKey },
      timeout: 2000,
    });

    const data = response.data;
    if (!data || !data.country_name) {
      return null;
    }

    return {
      country: data.country_name,
      region: data.region_name,
      city: data.city,
    };
  } catch (error) {
    console.error("Geo-IP lookup failed:", error.message);
    return null;
  }
};

export default getGeoLocation;
