import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import { useEffect, useState } from "react";
import { me } from "./features/auth.js";
import { useDispatch, useSelector } from "react-redux";
import HomePage from "./pages/HomePage";
import { setUserData } from "./redux/userSlice";
import Agents from "./pages/Agents";
import Integration from "./pages/Integration";
import CreateAgent from "./pages/CreateAgent";
import { setAgents } from "./redux/agentSlice";
import { getAllAgents } from "./features/agent";
import Pricing from "./pages/Pricing";

const App = () => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const { userData } = useSelector((state) => state.user);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await me();
        if (data) {
          dispatch(setUserData(data));
        }
      } catch {
        dispatch(setUserData(null));
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [dispatch]);

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const data = await getAllAgents();
        dispatch(setAgents(data));
      } catch (error) {
        console.error("Error fetching agents:", error);
      }
    };

    if (userData) {
      fetchAgent();
    }
  }, [userData, dispatch]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121317] text-white">
        <p className="text-sm text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            userData ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage initialMode="signin" />
            )
          }
        />
        <Route
          path="/signin"
          element={
            userData ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage initialMode="signin" />
            )
          }
        />
        <Route
          path="/signup"
          element={
            userData ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage initialMode="signup" />
            )
          }
        />
        <Route
          path="/"
          element={userData ? <HomePage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/agents"
          element={userData ? <Agents /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/integration"
          element={
            userData ? <Integration /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/pricing"
          element={
            userData ? <Pricing /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/agents/new"
          element={
            userData ? <CreateAgent /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="*"
          element={<Navigate to={userData ? "/" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
