// steps: [{ label, state }] where state is 'done' | 'active' | 'pending' | 'error'
export default function Stepper({ steps }) {
  return (
    <div className="stepper">
      {steps.map((step, i) => (
        <div className={`stepper-item stepper-${step.state}`} key={step.label}>
          <div className="stepper-dot">
            {step.state === "done" ? "✓" : step.state === "error" ? "!" : i + 1}
          </div>
          <div className="stepper-label">{step.label}</div>
          {i < steps.length - 1 && <div className="stepper-line" />}
        </div>
      ))}
    </div>
  );
}
