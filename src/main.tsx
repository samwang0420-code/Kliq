import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { I18nProvider } from "./contexts/I18nContext.tsx";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import "./index.css";

document.documentElement.dataset.platform = /mac/i.test(navigator.platform) ? "macos" : "other";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<ThemeProvider>
			<I18nProvider>
				<AuthProvider>
					<App />
				</AuthProvider>
			</I18nProvider>
		</ThemeProvider>
	</React.StrictMode>,
);
