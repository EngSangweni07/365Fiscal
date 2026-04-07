import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function DemoPaymentSuccessPage() {
  return (
    <div className="login-shell login-centered">
      <div className="login-card login-card-glass demo-payment-success-card">
        <div className="login-card-body demo-payment-success-body">
          <div className="demo-payment-success-icon" aria-hidden="true">
            <CheckCircle2 size={54} strokeWidth={2.2} />
          </div>
          <h1 className="demo-payment-success-title">Payment Successful</h1>
          <p className="demo-payment-success-copy">
            Your payment was successful! <br />
            You can now access your subscription and enjoy your services.
          </p>
        </div>

        <div className="login-card-footer demo-payment-success-footer">
          <Link
            to="/subscriptions"
            className="login-btn demo-payment-success-btn"
          >
            Continue
          </Link>
          <Link to="/login" className="demo-payment-success-link">
            Go to login
          </Link>
        </div>
      </div>
    </div>
  );
}
