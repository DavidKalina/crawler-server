import axios from "axios";
import robotsParser from "robots-parser";

export async function consultRobotsTxt(normalizedUrl: string) {
  const robotsUrl = new URL("/robots.txt", normalizedUrl).href;
  try {
    const robotsResponse = await axios.get(robotsUrl);
    const robots = robotsParser(robotsUrl, robotsResponse.data);
    return !!robots.isAllowed(normalizedUrl);
  } catch {
    console.warn(`Could not fetch robots.txt for ${normalizedUrl}, proceeding with crawl`);
    return true;
  }
}
