import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getApiBaseUrl } from "@/lib/api-base-url";

setBaseUrl(getApiBaseUrl());

createRoot(document.getElementById("root")!).render(<App />);
