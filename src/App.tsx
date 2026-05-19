import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Layout from "./layouts/Layout";
import AuthLayout from "./layouts/AuthLayout";
import ScrollToTop from "./components/ScrollToTop";
import { Toaster } from "./shared/ui/toaster";
import { BookingSelectionProvider } from "./contexts/BookingSelectionContext";
import Register from "./pages/Register";
import SignIn from "./pages/SignIn";
import AddHotel from "./pages/AddHotel";
import MyHotels from "./pages/MyHotels";
import EditHotel from "./pages/EditHotel";
import Search from "./pages/Search";
import Detail from "./pages/Detail";
import Booking from "./pages/Booking";
import MyBookings from "./pages/MyBookings";
import Home from "./pages/Home";
import ApiDocs from "./pages/ApiDocs";
import ApiStatus from "./pages/ApiStatus";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import AuthCallback from "./pages/AuthCallback";
import AdminReports from "./pages/AdminReports";
import AdminManagement from "./pages/AdminManagement";
import BusinessInsights from "./pages/BusinessInsights";
import ResortApproval from "./pages/Admin/ResortApproval";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import WebsiteFeedbackManagement from "./pages/Admin/WebsiteFeedbackManagement";
import WebsiteFeedback from "./components/WebsiteFeedback";
import ErrorBoundary from "./components/ErrorBoundary";
import ResortReports from "./pages/ResortReports";
import AdminAnalytics from "./pages/AdminAnalytics";
import AuthDebug from "./components/AuthDebug";
import AdminLogin from "./pages/AdminLogin";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import AdminLayout from "./layouts/AdminLayout";
import ApplyResortOwner from "./pages/ApplyResortOwner";
import ManageFrontDesk from "./pages/ManageFrontDesk";
import AdminApplicationReview from "./pages/AdminApplicationReview";

const App = () => {
  return (
    <ErrorBoundary>
      <BookingSelectionProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route
              path="/"
              element={
                <Layout>
                  <Home />
                </Layout>
              }
            />
            <Route
              path="/search"
              element={
                <Layout>
                  <Search />
                </Layout>
              }
            />
            <Route
              path="/detail/:id"
              element={
                <Layout>
                  <Detail />
                </Layout>
              }
            />
            <Route
              path="/api-docs"
              element={
                <Layout>
                  <ApiDocs />
                </Layout>
              }
            />
            <Route
              path="/api-status"
              element={
                <Layout>
                  <ApiStatus />
                </Layout>
              }
            />
            <Route
              path="/business-insights"
              element={
                <Layout>
                  <AnalyticsDashboard />
                </Layout>
              }
            />
            <Route
              path="/register"
              element={
                <AuthLayout>
                  <Register />
                </AuthLayout>
              }
            />
            <Route
              path="/sign-in"
              element={
                <AuthLayout>
                  <SignIn />
                </AuthLayout>
              }
            />
            <Route
              path="/auth/callback"
              element={
                <Layout>
                  <AuthCallback />
                </Layout>
              }
            />

            {/* Protected Routes - Require Login */}
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <MyBookings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-hotels"
              element={
                <ProtectedRoute>
                  <Layout>
                    <MyHotels />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/add-hotel"
              element={
                <ProtectedRoute>
                  <Layout>
                    <AddHotel />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/edit-hotel/:hotelId"
              element={
                <ProtectedRoute>
                  <Layout>
                    <EditHotel />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/apply-resort-owner"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ApplyResortOwner />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/resort/reports"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ResortReports />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/manage-front-desk"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ManageFrontDesk />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* Secret Admin Login Route - No public links to this */}
            <Route 
              path="/admin-login" 
              element={
                <AdminAuthProvider>
                  <AdminLogin />
                </AdminAuthProvider>
              } 
            />
            <Route
              path="/website-feedback"
              element={
                <Layout>
                  <WebsiteFeedback />
                </Layout>
              }
            />
            {/* Secret Admin Dashboard Routes - Protected and hidden */}
            <Route
              path="/admin-dashboard"
              element={
                <AdminProtectedRoute>
                  <AdminAuthProvider>
                    <AdminLayout />
                  </AdminAuthProvider>
                </AdminProtectedRoute>
              }
            >
              <Route index element={<Navigate to="management" replace />} />
              <Route
                path="business-insights"
                element={<BusinessInsights />}
              />
              <Route
                path="resort-approval"
                element={<ResortApproval />}
              />
              <Route
                path="management"
                element={<AdminManagement />}
              />
              <Route
                path="analytics"
                element={<AdminAnalytics />}
              />
              <Route
                path="feedback"
                element={<WebsiteFeedbackManagement />}
              />
              <Route
                path="reports"
                element={<AdminReports />}
              />
              <Route
                path="resort-reports"
                element={<ResortReports />}
              />
              <Route
                path="applications"
                element={<AdminApplicationReview />}
              />
            </Route>

            {/* Debug Route */}
            <Route
              path="/debug-auth"
              element={
                <Layout>
                  <AuthDebug />
                </Layout>
              }
            />

            {/* Booking Routes - Require Login */}
            <Route
              path="/hotel/:hotelId/booking"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Booking />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          <Toaster />
        </Router>
      </BookingSelectionProvider>
    </ErrorBoundary>
  );
};

export default App;
