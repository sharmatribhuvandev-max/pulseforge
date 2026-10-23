import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

function App() {
    const token = localStorage.getItem("token");

    if (!token) {
        return <Login />;
    }

    return <Dashboard />;
}

export default App;
