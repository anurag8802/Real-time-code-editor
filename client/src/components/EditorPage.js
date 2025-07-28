import React, { useEffect, useRef, useState } from "react";
import Client from "./Client";
import Editor from "./Editor";
import { initSocket } from "../Socket";
import { ACTIONS } from "../Actions";
import {
  useNavigate,
  useLocation,
  Navigate,
  useParams,
} from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';


// List of supported languages
const API_URL = process.env.REACT_APP_BACKEND_URL;
const LANGUAGES = [
  "python3",
  "java",
  "cpp",
  "nodejs",
  "c",
  "ruby",
  "go",
  "scala",
  "bash",
  "sql",
  "pascal",
  "csharp",
  "php",
  "swift",
  "rust",
  "r",
];

function EditorPage() {
  const [clients, setClients] = useState([]);
  const [output, setOutput] = useState("");
  const [isCompileWindowOpen, setIsCompileWindowOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("python3");
  const codeRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const Location = useLocation();
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [codeHistory, setCodeHistory] = useState(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem(`codeHistory-${roomId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);

  const socketRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on("connect_error", (err) => handleErrors(err));
      socketRef.current.on("connect_failed", (err) => handleErrors(err));

      const handleErrors = (err) => {
        console.log("Error", err);
        toast.error("Socket connection failed, Try again later");
        navigate("/");
      };

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: Location.state?.username,
      });

      socketRef.current.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId }) => {
          if (username !== Location.state?.username) {
            toast.success(`${username} joined the room.`);
          }
          setClients(clients);
          socketRef.current.emit(ACTIONS.SYNC_CODE, {
            code: codeRef.current,
            socketId,
          });
        }
      );

      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });
    };
    init();

    return () => {
      socketRef.current && socketRef.current.disconnect();
      socketRef.current.off(ACTIONS.JOINED);
      socketRef.current.off(ACTIONS.DISCONNECTED);
    };
  }, []);

  if (!Location.state) {
    return <Navigate to="/" />;
  }

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success(`Room ID is copied`);
    } catch (error) {
      console.log(error);
      toast.error("Unable to copy the room ID");
    }
  };

  const leaveRoom = async () => {
    navigate("/");
  };

  const runCode = async () => {
    setIsCompiling(true);
    try {
      const response = await axios.post(`${API_URL}/compile`, {
        code: codeRef.current,
        language: selectedLanguage,
      });
      console.log("Backend response:", response.data);
      setOutput(response.data.output || JSON.stringify(response.data));
    } catch (error) {
      console.error("Error compiling code:", error);
      setOutput(error.response?.data?.error || "An error occurred");
    } finally {
      setIsCompiling(false);
    }
  };

  const toggleCompileWindow = () => {
    setIsCompileWindowOpen(!isCompileWindowOpen);
  };

  // Helper: is mobile
  const isMobile = window.innerWidth < 768;

  // Track code changes for history
  const handleCodeChange = (code) => {
    codeRef.current = code;
    setCodeHistory((prev) => {
      if (prev.length === 0 || prev[prev.length - 1] !== code) {
        const updated = [...prev, code];
        localStorage.setItem(`codeHistory-${roomId}` , JSON.stringify(updated));
        return updated;
      }
      return prev;
    });
  };
  // Revert to a previous version
  const revertToVersion = (idx) => {
    const code = codeHistory[idx];
    codeRef.current = code;
    // Sync with editor and others
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.CODE_CHANGE, {
        roomId,
        code,
      });
    }
    setCodeHistory((prev) => prev.slice(0, idx + 1));
    localStorage.setItem(`codeHistory-${roomId}` , JSON.stringify(codeHistory.slice(0, idx + 1)));
    setShowHistory(false);
  };

  return (
    <div className="container-fluid vh-100 d-flex flex-column">
      <div className="row flex-grow-1 position-relative">
        {/* Sidebar toggle button for mobile */}
        {isMobile && (
          <button
            className="btn btn-secondary position-absolute"
            style={{ top: 10, left: 10, zIndex: 2000 }}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? "Hide Menu" : "Show Menu"}
          </button>
        )}
        {/* Client panel */}
        <div
          className={`col-md-2 bg-dark text-light d-flex flex-column ${
            isMobile ? (sidebarOpen ? "d-block position-absolute h-100" : "d-none") : ""
          }`}
          style={isMobile && sidebarOpen ? { width: "80vw", maxWidth: 320, left: 0, top: 0, zIndex: 1500, boxShadow: "2px 0 8px rgba(0,0,0,0.2)" } : {}}
        >
          <img
            src="/images/codecast.png"
            alt="Logo"
            className="img-fluid mx-auto"
            style={{ maxWidth: "150px", marginTop: "-43px" }}
          />
          <hr style={{ marginTop: "-3rem" }} />

          {/* Client list container */}
          <div className="d-flex flex-column flex-grow-1 overflow-auto">
            <span className="mb-2">Members</span>
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>

          <hr />
          {/* Buttons */}
          <div className="mt-auto mb-3">
            <button className="btn btn-success w-100 mb-2" onClick={copyRoomId}>
              Copy Room ID
            </button>
            <button className="btn btn-danger w-100" onClick={leaveRoom}>
              Leave Room
            </button>
          </div>
        </div>

        {/* Editor panel */}
        <div className="col-md-10 text-light d-flex flex-column" style={isMobile ? { paddingLeft: sidebarOpen ? "80vw" : 0, transition: "padding-left 0.3s" } : {}}>
          {/* History button */}
          <div className="d-flex justify-content-between align-items-center bg-dark p-2">
            <button className="btn btn-outline-info btn-sm" onClick={() => setShowHistory(true)}>
              Code History
            </button>
            <select
              className="form-select w-auto"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
          <Editor
            socketRef={socketRef}
            roomId={roomId}
            onCodeChange={handleCodeChange}
          />
        </div>
      </div>

      {/* Compiler toggle button */}
      <button
        className="btn btn-primary position-fixed bottom-0 end-0 m-3"
        onClick={toggleCompileWindow}
        style={{ zIndex: 1050 }}
      >
        {isCompileWindowOpen ? "Close Compiler" : "Open Compiler"}
      </button>

      {/* Compiler section */}
      <div
        className={`bg-dark text-light p-3 ${
          isCompileWindowOpen ? "d-block" : "d-none"
        }`}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: isCompileWindowOpen ? "30vh" : "0",
          transition: "height 0.3s ease-in-out",
          overflowY: "auto",
          zIndex: 1040,
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="m-0">Compiler Output ({selectedLanguage})</h5>
          <div>
            <button
              className="btn btn-success me-2"
              onClick={runCode}
              disabled={isCompiling}
            >
              {isCompiling ? "Compiling..." : "Run Code"}
            </button>
            <button className="btn btn-secondary" onClick={toggleCompileWindow}>
              Close
            </button>
          </div>
        </div>
        <pre className="bg-secondary p-3 rounded">
          {output || "Output will appear here after compilation"}
        </pre>
      </div>

      {/* Code History Modal */}
      <Modal show={showHistory} onHide={() => setShowHistory(false)} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Code History</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {codeHistory.length === 0 ? (
            <div>No history yet.</div>
          ) : (
            <ul className="list-group">
              {codeHistory.map((code, idx) => (
                <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                  <pre style={{ maxWidth: '80vw', overflowX: 'auto', margin: 0 }}>{code.slice(0, 200)}{code.length > 200 ? '...' : ''}</pre>
                  <Button variant="outline-success" size="sm" onClick={() => revertToVersion(idx)}>
                    Revert
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowHistory(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default EditorPage;
