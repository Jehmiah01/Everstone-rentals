// RentalCover damage and theft protection card (affiliate link).
// Shown on the reservation page once a booking is paid.

const CSS = `
.rc-card{max-width:560px;margin:24px auto;padding:26px;border-radius:18px;background:linear-gradient(135deg,#134e4a,#0f766e);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 12px 32px rgba(19,78,74,.28);box-sizing:border-box}
.rc-card .rc-tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:rgba(255,255,255,.16);padding:5px 12px;border-radius:999px}
.rc-card h3{margin:14px 0 8px;font-size:23px;font-weight:700;line-height:1.25;color:#fff}
.rc-card p{margin:0 0 20px;font-size:16px;line-height:1.55;color:rgba(255,255,255,.9)}
.rc-card a.rc-btn{display:inline-block;background:#5eead4;color:#134e4a;font-weight:700;font-size:16px;text-decoration:none;padding:13px 24px;border-radius:999px;transition:transform .15s ease,background .15s ease}
.rc-card a.rc-btn:hover{transform:translateY(-2px);background:#99f6e4}
.rc-card small{display:block;margin-top:16px;font-size:12px;color:rgba(255,255,255,.75)}
`;

export function ProtectionCard() {
  return (
    <div className="rc-card">
      <style>{CSS}</style>
      <span className="rc-tag">🛡️ Protect your rental</span>
      <h3>Got your rental car? Now protect it.</h3>
      <p>
        One dent, scratch or break-in can leave you paying the rental company's damage bill. Get damage and theft protection
        from RentalCover.com in minutes, before you drive away.
      </p>
      <a className="rc-btn" href="https://rentalcoveraudran.onepath.io/5kNKZo" target="_blank" rel="sponsored noopener">
        Get covered now →
      </a>
      <small>Affiliate link: I may earn a commission at no extra cost to you.</small>
    </div>
  );
}
