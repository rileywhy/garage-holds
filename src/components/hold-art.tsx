"use client";

import { useId } from "react";
import type { Hold, Illustration } from "@/features/holds/types";
import { FileBox } from "lucide-react";
import { StlPreview } from "@/features/holds/stl-preview";
import { StlViewer } from "@/features/holds/stl-viewer";
import { PhotoImage } from "./photo-image";

const profiles: Record<Illustration, string> = {
  ripple:
    "M92 176C73 141 83 101 123 77C158 56 204 61 243 77C291 97 321 130 311 166C304 190 288 190 276 201C265 212 276 221 253 228C206 245 113 218 92 176Z",
  edge: "M84 164L117 106Q123 94 144 91L282 114Q299 117 306 134L321 179Q326 195 305 199L127 207Q97 207 84 190Q76 178 84 164Z",
  pebble:
    "M83 178C58 142 100 83 151 64C200 44 257 77 287 109C314 139 323 175 298 201C257 244 121 234 83 178Z",
  pinch:
    "M119 194C87 159 108 104 154 82C192 64 233 74 258 101C274 119 260 129 278 147C307 173 295 200 262 218C221 240 151 230 119 194Z",
  pocket:
    "M89 174C77 134 103 86 146 74C187 59 240 72 276 106C315 139 318 177 287 204C250 234 181 239 131 217C108 207 95 193 89 174Z",
  foot: "M128 178L169 113Q177 101 193 108L266 148Q282 160 275 175L258 203Q247 216 229 212L145 203Q120 200 128 178Z",
};

export function HoldIllustration({
  hold,
  large = false,
}: {
  hold: Hold;
  large?: boolean;
}) {
  const uid = useId().replaceAll(":", "");
  const face = `face${uid}`,
    side = `side${uid}`,
    grain = `grain${uid}`;
  return (
    <svg
      viewBox="0 0 400 300"
      className={`hold-illustration ${large ? "large" : ""}`}
      role="img"
      aria-label={`${hold.title}, sample design illustration`}
    >
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="0.75" y2="1">
          <stop stopColor={hold.color} />
          <stop offset=".5" stopColor={hold.color} />
          <stop offset="1" stopColor="#2d3029" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id={side} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={hold.color} />
          <stop offset="1" stopColor="#353830" />
        </linearGradient>
        <filter id={grain}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".75"
            numOctaves="3"
            seed="4"
            result="noise"
          />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in="SourceGraphic" mode="soft-light" />
        </filter>
      </defs>
      <ellipse
        cx="209"
        cy="230"
        rx="116"
        ry="15"
        fill="#39362c"
        opacity=".09"
      />
      <g transform="rotate(-12 200 150)">
        <path
          d={profiles[hold.illustration]}
          transform="translate(0 12)"
          fill={`url(#${side})`}
        />
        <path
          d={profiles[hold.illustration]}
          fill={`url(#${face})`}
          filter={`url(#${grain})`}
        />
        {hold.illustration === "ripple" && (
          <>
            <path
              d="M110 139Q156 91 220 113T287 153"
              fill="none"
              stroke="#fff"
              strokeOpacity=".20"
              strokeWidth="8"
            />
            <path
              d="M116 159Q164 111 224 132T289 172"
              fill="none"
              stroke="#442d20"
              strokeOpacity=".19"
              strokeWidth="13"
            />
            <path
              d="M128 180Q175 133 234 153"
              fill="none"
              stroke="#fff"
              strokeOpacity=".12"
              strokeWidth="7"
            />
          </>
        )}
        {hold.illustration === "edge" && (
          <>
            <path
              d="M110 134L289 151"
              stroke="#fff"
              strokeOpacity=".3"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M105 143L294 160"
              stroke="#263128"
              strokeOpacity=".28"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </>
        )}
        {hold.illustration === "pinch" && (
          <path
            d="M187 93Q159 144 185 205"
            fill="none"
            stroke="#44374a"
            strokeOpacity=".35"
            strokeWidth="15"
          />
        )}
        {hold.illustration === "pocket" && (
          <>
            <ellipse
              cx="191"
              cy="138"
              rx="43"
              ry="29"
              fill="#243535"
              opacity=".72"
            />
            <path
              d="M155 133Q189 108 227 133"
              fill="none"
              stroke="#fff"
              strokeOpacity=".18"
              strokeWidth="7"
            />
          </>
        )}
        {hold.mount !== "Screw-on" && (
          <>
            <ellipse
              cx="217"
              cy={hold.illustration === "pocket" ? 191 : 184}
              rx="11"
              ry="8"
              fill="#2d2a25"
              opacity=".8"
            />
            <ellipse
              cx="217"
              cy={hold.illustration === "pocket" ? 189 : 182}
              rx="5"
              ry="4"
              fill="#111"
              opacity=".7"
            />
          </>
        )}
        <circle
          cx={hold.illustration === "foot" ? 168 : 132}
          cy="186"
          r="3"
          fill="#292b25"
          opacity=".65"
        />
      </g>
    </svg>
  );
}

// The model file the browser can render, if any.
export function previewModel(hold: Hold) {
  return hold.files.find(
    (file) => file.extension.toLowerCase() === "stl" && file.url,
  );
}

// A photo by index, or the 3D preview when the index is past the photos
// (cards cycle through photos and then the model). The design page (large)
// gets the interactive viewer; cards get a one-off thumbnail.
export function HoldVisual({
  hold,
  large = false,
  photoIndex = 0,
}: {
  hold: Hold;
  large?: boolean;
  photoIndex?: number;
}) {
  const stl = previewModel(hold);
  const photo = hold.photos[photoIndex];
  return photo ? (
    <PhotoImage
      key={photo.id}
      src={large ? photo.largeUrl : photo.cardUrl}
      fallback={photo.url}
      alt={`${hold.title}, photo ${photoIndex + 1} of ${hold.photos.length}`}
      className="hold-photo"
    />
  ) : hold.isSample ? (
    <HoldIllustration hold={hold} large={large} />
  ) : stl ? (
    large ? (
      <StlViewer file={stl} title={hold.title} />
    ) : (
      <StlPreview file={stl} title={hold.title} />
    )
  ) : (
    <div className="image-placeholder no-photo-visual">
      <FileBox size={32} aria-hidden="true" />
      <span>No photo yet</span>
      <small>Model files available · STL needed for a preview</small>
    </div>
  );
}
