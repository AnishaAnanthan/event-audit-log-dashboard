import { useContext, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function toDateKey(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function LogImportMenuPopup({ onVisualized, inline = false }) {
  const { API, token } = useContext(AuthContext);
  const [file, setFile] = useState(null);
  const [replacePrevious, setReplacePrevious] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultInfo, setResultInfo] = useState(null);

  const helperText = useMemo(() => (file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "No file selected"), [file]);

  const handleVisualize = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResultInfo(null);
    try {
      const content = await readFileAsText(file);
      const { data } = await API.post(
        "/api/events/admin/import-uploaded-log",
        {
          fileName: file.name,
          content,
          replacePreviousUploads: replacePrevious,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setResultInfo(data);
      if (!Number(data?.importedCount || 0)) {
        setError("No events were extracted from this file. Try a different format or file.");
        return;
      }

      try {
        sessionStorage.setItem("uploadedLogImportResult", JSON.stringify(data));
      } catch (_err) {
        // ignore storage errors
      }

      onVisualized?.({
        importSessionId: data.importSessionId,
        importStart: toDateKey(data.minDate),
        importEnd: toDateKey(data.maxDate),
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Upload/import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`menu-log-import-popup ${inline ? "inline" : ""}`}>
      <div className="menu-log-import-title">Upload Your Log File</div>
      <input
        type="file"
        accept=".log,.txt,.csv,.json"
        className="menu-log-import-file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <div className="menu-log-import-helper">{helperText}</div>
      <label className="menu-log-import-check">
        <input
          type="checkbox"
          checked={replacePrevious}
          onChange={(e) => setReplacePrevious(e.target.checked)}
        />
        Replace previous uploaded logs
      </label>
      <button
        type="button"
        className="dashboard-floating-menu-item menu-log-import-visualize"
        onClick={handleVisualize}
        disabled={!file || loading}
      >
        {loading ? "Visualizing..." : "Visualize"}
      </button>
      {error && <div className="menu-log-import-error">{error}</div>}
      {resultInfo && (
        <div className="menu-log-import-result">
          <div>Imported: <strong>{resultInfo.importedCount || 0}</strong></div>
          <div>Skipped: <strong>{resultInfo.skippedCount || 0}</strong></div>
          <div>Lines: <strong>{resultInfo.totalLines || 0}</strong></div>
        </div>
      )}
    </div>
  );
}

export default LogImportMenuPopup;
