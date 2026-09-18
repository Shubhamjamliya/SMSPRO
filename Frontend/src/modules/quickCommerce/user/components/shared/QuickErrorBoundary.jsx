import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

class QuickErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Caught by QuickErrorBoundary:", error, errorInfo);
  }

  handleBack = () => {
    this.setState({ hasError: false, error: null });
    window.history.back();
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || this.state.error?.toString?.() || "";
      const isOrderDetail = typeof window !== "undefined" && /\/quick\/orders\//.test(window.location.pathname);
      const confirmed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("confirmed") === "true";

      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md"
          >
            <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            
            <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">
              {isOrderDetail && confirmed ? "Order placed" : "Something went wrong"}
            </h1>
            <h2 className="text-xl font-bold text-gray-800 mb-3">
              {isOrderDetail && confirmed
                ? "We couldn't open the tracking page"
                : "We hit a snag loading this page"}
            </h2>
            <p className="text-gray-500 mb-4 text-[15px] leading-relaxed">
              {isOrderDetail && confirmed
                ? "Your order was created successfully. You can view it from My Orders or try loading this page again."
                : "The page could not be loaded right now. Please go back and try again."}
            </p>
            {import.meta.env.DEV && message ? (
              <p className="mb-6 text-left text-xs font-mono text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 break-words">
                {message}
              </p>
            ) : null}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button 
                onClick={this.handleBack}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </button>
              {isOrderDetail ? (
                <Link 
                  to="/quick/orders"
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="flex items-center justify-center px-6 py-3.5 bg-[#FF6A00] hover:bg-[#E54D02] text-white rounded-xl font-bold transition-colors shadow-lg shadow-[#FF6A00]/20"
                >
                  My Orders
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="flex items-center justify-center px-6 py-3.5 bg-[#FF6A00] hover:bg-[#E54D02] text-white rounded-xl font-bold transition-colors shadow-lg shadow-[#FF6A00]/20"
                >
                  Try Again
                </button>
              )}
            </div>
            {!isOrderDetail ? (
              <Link 
                to="/quick"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="inline-block mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                Back to Home
              </Link>
            ) : null}
          </motion.div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default QuickErrorBoundary;
