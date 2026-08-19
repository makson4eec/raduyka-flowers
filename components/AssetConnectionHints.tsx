"use client";

import ReactDOM from "react-dom";

const ASSET_ORIGIN = "https://raduyka-flowers.vercel.app";

export default function AssetConnectionHints() {
  if (process.env.NODE_ENV === "production") {
    ReactDOM.preconnect(ASSET_ORIGIN, { crossOrigin: "anonymous" });
    ReactDOM.prefetchDNS(ASSET_ORIGIN);
  }

  return null;
}
