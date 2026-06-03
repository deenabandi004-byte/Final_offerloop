// Page header row: title + subtitle on the left, Ask Scout button on the right.

interface ProtoHeaderProps {
  onAskScout: () => void;
}

export function ProtoHeader({ onAskScout }: ProtoHeaderProps) {
  return (
    <div className="header-row">
      <div className="page-header-block">
        <h1 className="page-title">Your Outbox</h1>
        <p className="page-subtitle">Stay on top of every conversation</p>
      </div>
      <button type="button" className="ask-scout-btn" onClick={onAskScout}>
        <svg width="16" height="16" viewBox="0 0 14.6667 14.3333" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.33301 1.83301H7.5V2.16699H5.33301C2.84788 2.16717 0.833008 4.18182 0.833008 6.66699C0.833083 8.00541 1.29821 9.12239 2.25586 10.1143C3.19398 11.0859 4.59638 11.9293 6.45996 12.7754L7.16699 13.0957V11.167H8C10.3161 11.167 12.2228 9.41676 12.4717 7.16699H12.8076C12.5573 9.60129 10.5004 11.5 8 11.5H7.5V13.5908C6.00126 12.9755 4.37118 12.2329 3.05371 11.2275C1.54331 10.0749 0.500116 8.62294 0.5 6.66699C0.5 3.99772 2.66378 1.83318 5.33301 1.83301ZM12.0205 0.811523C12.3566 1.6228 12.9854 2.2744 13.7803 2.62793L13.9531 2.70508L13.752 2.79492C12.977 3.13959 12.3595 3.76796 12.0176 4.55273L12 4.59277L11.9824 4.55273C11.6405 3.76796 11.023 3.13959 10.248 2.79492L10.0459 2.70508L10.2197 2.62793C11.0146 2.2744 11.6435 1.62284 11.9795 0.811523L12 0.761719L12.0205 0.811523Z" stroke="currentColor" />
        </svg>
        Ask Scout
      </button>
    </div>
  );
}
