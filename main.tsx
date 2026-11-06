import { createRoot } from "react-dom/client";

function App() {
  return <h1 className="text-2xl font-bold">TypeRacer Orion</h1>;
}

createRoot(document.getElementById("root")!).render(<App />);
