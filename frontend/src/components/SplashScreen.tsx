import { useEffect, useState } from "react";

type SplashProps = {
  label?: string;
};

export default function SplashScreen({ label = "Loading" }: SplashProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 350);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="splash">
      <div className="splash-card">
        <div className="splash-logo">
          <img src="/three.png" alt="Three65" />
        </div>
        <div className="splash-title">Three65</div>
        <div className="splash-sub">{label}{dots}</div>
        <div className="splash-bar">
          <span className="splash-line" />
        </div>
      </div>
    </div>
  );
}

