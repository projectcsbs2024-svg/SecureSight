import { useState } from "react";

export const AddCameraModal = ({ onAdd, onClose }) => {
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) setFile(URL.createObjectURL(selected));
  };

  const handleAdd = () => {
    const src = mode === "file" ? file : url;
    if (src) {
      onAdd(src);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-transparent backdrop-brightness-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-xl w-96 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4 text-center text-primary">
          Add Camera Feed
        </h2>

        {/* Mode Toggle */}
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => setMode("file")}
            className={`px-3 py-1 rounded-lg ${
              mode === "file" ? "bg-primary" : "bg-gray-700"
            }`}
          >
            Upload File
          </button>
          <button
            onClick={() => setMode("url")}
            className={`px-3 py-1 rounded-lg ${
              mode === "url" ? "bg-primary" : "bg-gray-700"
            }`}
          >
            Stream URL
          </button>
        </div>

        {/* Input Fields */}
        {mode === "file" ? (
          <>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-300 mb-4"
            />
            {file && (
              <video src={file} className="w-full rounded-lg mb-3" controls />
            )}
          </>
        ) : (
          <input
            type="text"
            placeholder="Enter camera stream URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-4"
          />
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={mode === "file" ? !file : !url}
            className={`px-4 py-2 rounded-lg ${
              (mode === "file" && file) || (mode === "url" && url)
                ? "bg-primary hover:bg-teal-600"
                : "bg-gray-500 cursor-not-allowed"
            }`}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};
