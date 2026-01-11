import axios from "axios";

const getGeoLocation = async (ip) => {
  try {
    if (!process.env.GEO_IP_API_KEY || ip === "127.0.0.1") {
      return {};
    }

    const response = await axios.get(
      `https://ipinfo.io/${ip}?token=${process.env.GEO_IP_API_KEY}`
    );

    const { country, region, city } = response.data;

    return { country, region, city };
  } catch (error) {
    return {};
  }
};

export default getGeoLocation;
