import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Application root element was not found.");
}

const root = createRoot(rootElement);

void import("./App.tsx")
  .then(({ default: App }) => {
    root.render(<App />);
  })
  .catch((error) => {
    console.error("DYP GOALS failed to start", error);
    root.render(
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily: "Poppins, system-ui, sans-serif",
          background: "#ffffff",
          color: "#14261d",
        }}
      >
        <section style={{ maxWidth: "560px", textAlign: "center" }}>
          <h1 style={{ fontSize: "28px", marginBottom: "12px" }}>
            DYP GOALS is temporarily unavailable
          </h1>
          <p style={{ lineHeight: 1.6, opacity: 0.8 }}>
            The application could not start correctly. Please refresh the page. If the
            problem continues, the DYP team has been given a visible startup signal
            instead of a blank screen.
          </p>
        </section>
      </main>,
    );
  });
