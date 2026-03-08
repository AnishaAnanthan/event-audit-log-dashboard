import { useState } from "react";
import AISecurity from "../../pages/AISecurity";

const MENU_ITEMS = [
  { key: "insight", label: "AI Insight Cards" },
  { key: "summary", label: "AI Threat Summary" },
  { key: "query", label: "AI Log Query Assistant" },
  { key: "triage", label: "AI Alert Triage" },
];

function FloatingAIAssistant({ onAddWidget }) {
  const [open, setOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState("");

  const openFeature = (feature) => {
    setActiveFeature(feature);
  };

  const closePanel = () => {
    setOpen(false);
    setActiveFeature("");
  };

  return (
    <>
      <div className={`ai-assistant-overlay ${open ? "open" : ""}`} onClick={closePanel} />
      <button
        type="button"
        className="ai-fab"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open AI Security Assistant"
        title="AI Security Assistant"
      >
        <span className="ai-fab-spark">✦</span>
        <span className="ai-fab-text">AI</span>
      </button>

      <div className={`ai-assistant-panel ${open ? "open" : ""}`}>
        <div className="ai-assistant-header">
          <div>
            <div className="ai-assistant-title">AI Security Assistant</div>
            <div className="ai-assistant-subtitle">Live security intelligence</div>
          </div>
          <button type="button" className="ai-assistant-close" onClick={closePanel} aria-label="Close">
            ×
          </button>
        </div>

        {!activeFeature ? (
          <div className="ai-assistant-menu">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="ai-assistant-menu-item"
                onClick={() => openFeature(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="ai-assistant-body">
            <div className="ai-assistant-toolbar top">
              <button
                type="button"
                className="ai-assistant-icon-btn"
                onClick={() => setActiveFeature("")}
                title="Back to Menu"
                aria-label="Back to Menu"
              >
                ←
              </button>
            </div>
            <div className="ai-assistant-content">
              <AISecurity mode="widget" activeFeature={activeFeature} />
            </div>
            <div className="ai-assistant-toolbar bottom">
              <button
                type="button"
                className="btn-secondary compact-btn ai-add-dashboard-btn"
                onClick={() => {
                  onAddWidget?.(activeFeature);
                  closePanel();
                }}
                title="Add to Dashboard"
                aria-label="Add to Dashboard"
              >
                Add to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default FloatingAIAssistant;

