import { useState } from "react";
import styles from "./CopyButton.module.css";

export default function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  return (
    <button
      type="button"
      className={`${styles.btn} ${copied ? styles.copied : ""}`}
      onClick={handleClick}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
