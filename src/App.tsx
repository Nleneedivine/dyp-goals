import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Planner from "./pages/Planner";
import MyGoals from "./pages/MyGoals";
import Journey from "./pages/Journey";
import Vision from "./pages/Vision";
import ProgressDashboard from "./pages/ProgressDashboard";
import FormManager from "./pages/admin/FormManager";
import FormBuilder from "./pages/admin/FormBuilder";
import FormAnalytics from "./pages/admin/FormAnalytics";
import PublicForm from "./pages/PublicForm";
import AdminAppearance from "./pages/admin/AdminAppearance";
import { UiModeProvider } from "./components/UiModeProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UiModeProvider>
        <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <Navbar />
          <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/apply/:slug" element={<PublicForm />} />
              <Route path="/" element={<Home />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/ai-goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
              <Route path="/my-goals" element={<ProtectedRoute><MyGoals /></ProtectedRoute>} />
              <Route path="/journey" element={<ProtectedRoute><Journey /></ProtectedRoute>} />
              <Route path="/vision" element={<ProtectedRoute><Vision /></ProtectedRoute>} />
              <Route path="/progress" element={<ProtectedRoute><ProgressDashboard /></ProtectedRoute>} />
              <Route path="/plan" element={<ProtectedRoute><Planner /></ProtectedRoute>} />
              <Route path="/mentorship" element={<ProtectedRoute><Mentorship /></ProtectedRoute>} />
              <Route path="/testimonials" element={<ProtectedRoute><Testimonials /></ProtectedRoute>} />
              <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/goal-history" element={<ProtectedRoute><GoalHistory /></ProtectedRoute>} />
              <Route path="/time-planner" element={<ProtectedRoute><Navigate to="/plan" replace /></ProtectedRoute>} />
              <Route path="/time-plans" element={<ProtectedRoute><Navigate to="/plan" replace /></ProtectedRoute>} />
              <Route
                path="/legacy/time-planner"
                element={
                  <ProtectedRoute>
                    <TimePlanReminderProvider>
                      <TimePlanner />
                    </TimePlanReminderProvider>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/legacy/time-plans"
                element={
                  <ProtectedRoute>
                    <TimePlanReminderProvider>
                      <TimePlansDashboard />
                    </TimePlanReminderProvider>
                  </ProtectedRoute>
                }
              />
              <Route path="/todo" element={<ProtectedRoute><Planner initialView="today" /></ProtectedRoute>} />
              <Route path="/mentor-dashboard" element={<MentorRoute><MentorDashboard /></MentorRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/admin/forms" element={<AdminRoute><FormManager /></AdminRoute>} />
              <Route path="/admin/forms/:formId/edit" element={<AdminRoute><FormBuilder /></AdminRoute>} />
              <Route path="/admin/forms/:formId/analytics" element={<AdminRoute><FormAnalytics /></AdminRoute>} />
              <Route path="/admin/appearance" element={<AdminRoute><AdminAppearance /></AdminRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </div>
        </BrowserRouter>
      </UiModeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;