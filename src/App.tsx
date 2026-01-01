import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import MentorRoute from "./components/MentorRoute";
import { TimePlanReminderProvider } from "./components/TimePlanReminderProvider";
import Home from "./pages/Home";
import Schedule from "./pages/Schedule";
import GoalsPage from "./pages/GoalsPage";
import Mentorship from "./pages/Mentorship";
import MentorDashboard from "./pages/MentorDashboard";
import Testimonials from "./pages/Testimonials";
import Contact from "./pages/Contact";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import GoalHistory from "./pages/GoalHistory";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import TimePlanner from "./pages/TimePlanner";
import TimePlansDashboard from "./pages/TimePlansDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TimePlanReminderProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Navbar />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
              <Route path="/ai-goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
              <Route path="/mentorship" element={<ProtectedRoute><Mentorship /></ProtectedRoute>} />
              <Route path="/testimonials" element={<ProtectedRoute><Testimonials /></ProtectedRoute>} />
              <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/goal-history" element={<ProtectedRoute><GoalHistory /></ProtectedRoute>} />
              <Route path="/time-planner" element={<ProtectedRoute><TimePlanner /></ProtectedRoute>} />
              <Route path="/time-plans" element={<ProtectedRoute><TimePlansDashboard /></ProtectedRoute>} />
              <Route path="/mentor-dashboard" element={<MentorRoute><MentorDashboard /></MentorRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Footer />
          </div>
        </TimePlanReminderProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;