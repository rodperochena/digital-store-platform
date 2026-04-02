import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { OwnerProvider } from "./context/OwnerContext";
import App from "./App";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <OwnerProvider>
          <App />
        </OwnerProvider>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
