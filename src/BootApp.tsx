import { useEffect, useState, type ComponentType } from "react";

function BootShell() {
  return (
    <div className="boot-shell" aria-live="polite" aria-label="EchoProfile is starting">
      <div className="boot-shell__orb" />
      <div className="boot-shell__panel">
        <div className="boot-shell__eyebrow">EchoProfile</div>
        <div className="boot-shell__title">Preparing your workspace</div>
        <div className="boot-shell__subtitle">Loading the desktop UI...</div>
        <div className="boot-shell__bar"><span /></div>
      </div>
    </div>
  );
}

export default function BootApp() {
  const [AppComponent, setAppComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    let mounted = true;
    void import("./App.tsx").then((module) => {
      if (mounted) {
        setAppComponent(() => module.default);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!AppComponent) {
    return <BootShell />;
  }

  return <AppComponent />;
}
