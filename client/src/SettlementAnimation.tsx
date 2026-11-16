import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Role, RoundRecord } from "shared";
import { settlementSteps } from "./roundPlayback";

const upstream: Record<Role, string> = {
  Retailer: "Wholesaler", Wholesaler: "Distributor", Distributor: "Factory", Factory: "Production Line"
};
const downstream: Record<Role, string> = {
  Retailer: "Consumers", Wholesaler: "Retailer", Distributor: "Wholesaler", Factory: "Distributor"
};

function Warehouse({ role, inventory }: { role: Role; inventory: number }) {
  return (
    <div className="warehouse" aria-label={`${role} warehouse: ${inventory} units`}>
      <svg viewBox="0 0 240 160" aria-hidden="true">
        <path d="M14 57 120 12l106 45v87H14Z" fill="#132d42" stroke="#58a6ff" strokeWidth="3" />
        <path d="M4 61 120 10l116 51" fill="none" stroke="#8dc4ff" strokeWidth="5" />
        <path d="M65 144V70h110v74" fill="#091723" stroke="#4380ad" strokeWidth="2" />
        <path d="M75 84h90M75 96h90M75 108h90" stroke="#234559" strokeWidth="2" />
        <rect x="22" y="83" width="27" height="25" rx="3" fill="#43d9ad" opacity=".6" />
        <rect x="191" y="83" width="27" height="25" rx="3" fill="#43d9ad" opacity=".6" />
      </svg>
      <b className="warehouse-role">{role}</b>
      <strong className="warehouse-stock">{inventory}</strong>
      <span>UNITS IN STOCK</span>
    </div>
  );
}

function Truck({ quantity, inbound }: { quantity: number; inbound: boolean }) {
  return (
    <div className={`settlement-truck ${inbound ? "inbound" : "outbound"}`}>
      <b>{inbound ? "+" : "-"}{quantity} units</b>
      <svg viewBox="0 0 140 78" aria-hidden="true">
        <rect x="5" y="8" width="82" height="49" rx="5" fill={inbound ? "#43d9ad" : "#58a6ff"} />
        <path d="M88 26h25l19 22v15H88Z" fill="#e6edf3" />
        <path d="M96 31h13l12 16H96Z" fill="#183b55" />
        <path d="M4 62h130" stroke="#8fa2b5" strokeWidth="6" />
        <circle cx="28" cy="64" r="10" fill="#0a141f" stroke="#8fa2b5" strokeWidth="4" />
        <circle cx="109" cy="64" r="10" fill="#0a141f" stroke="#8fa2b5" strokeWidth="4" />
      </svg>
    </div>
  );
}

export function SettlementPanel({ role, inventory, record, onReplay }: {
  role: Role; inventory: number; record?: RoundRecord; onReplay: () => void;
}) {
  return (
    <section className="card settlement-panel" aria-labelledby="settlement-panel-title">
      <div className="settlement-panel-heading">
        <div>
          <span className="eyebrow">ROUND SETTLEMENT</span>
          <h3 id="settlement-panel-title">Your warehouse in motion</h3>
          <p>{record ? `Last settlement: Round ${record.round}` : "The animation plays automatically after all four players submit."}</p>
        </div>
        <button className="secondary" disabled={!record} onClick={onReplay}>Replay</button>
      </div>
      {record ? (
        <div className="settlement-summary">
          <div><span>Opening inventory</span><b>{record.openingInventory}</b></div>
          <div><span>Shipped to {downstream[role]}</span><b className="shipment-out">-{record.shipped}</b></div>
          <div><span>{role === "Factory" ? "Production received" : "Goods received"}</span><b className="shipment-in">+{record.shipmentReceived}</b></div>
          <div><span>Ending inventory</span><b>{record.inventory}</b></div>
        </div>
      ) : <div className="settlement-idle"><Warehouse role={role} inventory={inventory} /><p>Opening stock, deliveries and shipments will be shown here.</p></div>}
      <small className="muted">Zero shipment lead time: goods arrive after dispatch. Completed factory production is available before dispatch.</small>
    </section>
  );
}

export function SettlementAnimation({ record, onFinish }: { record: RoundRecord; onFinish: () => void }) {
  const steps = useMemo(() => settlementSteps(record), [record]);
  const [index, setIndex] = useState(0);
  const [transferredIndex, setTransferredIndex] = useState(-1);
  const skip = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const receiving = step.kind === "receive-before" || step.kind === "receive-after";
  const moving = receiving || step.kind === "ship";
  const transferred = transferredIndex === index;
  const stock = transferred ? step.after : step.before;

  useEffect(() => {
    const root = document.getElementById("root");
    const previousFocus = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    root?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    skip.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish();
      if (event.key === "Tab") { event.preventDefault(); skip.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root?.removeAttribute("inert");
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onFinish]);

  useEffect(() => {
    const transfer = window.setTimeout(() => setTransferredIndex(index), 850);
    const next = window.setTimeout(() => {
      if (index === steps.length - 1) onFinish();
      else setIndex(current => current + 1);
    }, 1700);
    return () => { window.clearTimeout(transfer); window.clearTimeout(next); };
  }, [index, steps, onFinish]);

  const title = step.kind === "opening" ? "Opening inventory"
    : step.kind === "closing" ? "Round settled"
    : receiving ? (record.role === "Factory" ? "Production received" : "Goods received") : "Goods shipped";
  const detail = step.kind === "opening" ? `Stock at the start of Round ${record.round}.`
    : step.kind === "closing" ? "The dashboard will now update."
    : receiving ? `${step.quantity} units from ${upstream[record.role]}.${step.kind === "receive-before" ? " Available before dispatch." : " Added after dispatch."}`
    : `${step.quantity} units delivered to ${downstream[record.role]}.`;

  return createPortal(
    <div className="settlement-backdrop">
      <section className="settlement-focus" role="dialog" aria-modal="true"
        aria-labelledby="settlement-title" aria-describedby="settlement-description">
        <div className="settlement-modal-heading">
          <span className="eyebrow">ROUND {record.round} SETTLEMENT</span>
          <span className="settlement-step-count">{index + 1} / {steps.length}</span>
        </div>
        <div className="settlement-caption" aria-live="polite" aria-atomic="true">
          <h2 id="settlement-title">{title}</h2>
          <p id="settlement-description">{detail}</p>
        </div>
        <div className="settlement-scene" data-phase={step.kind}>
          <div className="settlement-partner upstream"><span>UPSTREAM</span><b>{upstream[record.role]}</b></div>
          <Warehouse role={record.role} inventory={stock} />
          <div className="settlement-partner downstream"><span>DOWNSTREAM</span><b>{downstream[record.role]}</b></div>
          <div className="settlement-road" />
          {moving && <Truck key={index} inbound={receiving} quantity={step.quantity} />}
          {moving && transferred && <strong className={`stock-change ${receiving ? "shipment-in" : "shipment-out"}`}>
            {receiving ? "+" : "-"}{step.quantity}
          </strong>}
        </div>
        <div className="settlement-progress" aria-hidden="true">
          {steps.map((item, i) => <i key={item.kind} className={i <= index ? "filled" : ""} />)}
        </div>
        <div className="settlement-ledger">
          <span>Orders received <b>{record.demandReceived}</b></span>
          <span>Ending backlog <b className={record.backlog > 0 ? "error" : "shipment-in"}>{record.backlog}</b></span>
          <span>Ending cash <b>{record.cash.toFixed(2)}</b></span>
        </div>
        <div className="settlement-modal-footer">
          <small>Your dashboard stays locked until playback ends.</small>
          <button ref={skip} className="secondary" onClick={onFinish}>Skip Animation</button>
        </div>
      </section>
    </div>, document.body
  );
}
