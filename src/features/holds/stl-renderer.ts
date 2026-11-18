import {
  ACESFilmicToneMapping,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  ImageLoader,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { getStlViewDirection, fitStlCamera } from "./stl-orientation";
import { holdGeometry } from "./stl-scene";
import type { Orientation } from "./orientation";

// The hold's own axes once holdGeometry has stood it up.
const HOLD_FRAME = {
  across: new Vector3(1, 0, 0),
  depth: new Vector3(0, 1, 0),
  up: new Vector3(0, 0, 1),
};

const WIDTH = 640;
const HEIGHT = 480;

// The picture is a photo of the hold in the shop: it lies on a plywood
// table with a plywood board standing behind it, so everything around the
// hold is wood. The framing is in camera distances, so a hold of any size
// fills the same share of the picture. The wood is at true size, as the 3D
// viewer's bench is: gym wall, its holes 200 mm apart, with the file read
// as millimetres.
const FIELD_OF_VIEW = 26;
// How much higher the camera looks from than the plain side view, so the
// table top shows.
const CAMERA_LIFT = 0.13;
// The hold fills this share of the frame; the rest is table and board.
const HOLD_SHARE = 0.56;
// Where the board meets the table in the frame, in degrees above its middle.
const BOARD_FOOT_RISE = 5;
// table.webp tiles mirrored; this is the size of one tile (see
// docs/plywood-images.md).
const TABLE_TILE_MM = { width: 600, height: 400 };
// A hold's radius in millimetres falls in this range. A file outside it is
// in some other unit, so its table is scaled as if the hold were typical.
const HOLD_RADIUS_MM = { least: 12, most: 600, typical: 60 };
// Without the picture (blocked images, a failed download) the table and the
// board are these plain colours.
const TABLE_COLOR = 0xc9ab84;
const BOARD_COLOR = 0xb89a74;
// With it they are the same sheet under the same light; the board is
// darker only because the light comes from above.
const PLYWOOD_TINT = 0xeadfce;
const PLYWOOD_PICTURE = "/images/plywood/table.webp";

// Pictures are downloaded once and shared by every thumbnail. Each render
// has its own short-lived graphics context, so each makes its own textures.
const pictures = new Map<string, Promise<HTMLImageElement | null>>();
function picture(url: string) {
  let loading = pictures.get(url);
  if (!loading) {
    loading = new ImageLoader().loadAsync(url).catch(() => null);
    pictures.set(url, loading);
  }
  return loading;
}

function textureOf(image: HTMLImageElement | null) {
  if (!image) return null;
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Render once to a picture. Browsing cards don't keep WebGL contexts or
// animation loops alive.
//
// The picture is a 2D canvas the frame was drawn onto, never a data URL or
// blob read back out of one: browsers that resist fingerprinting (Firefox
// with resistFingerprinting, LibreWolf, Mullvad, Tor) answer toDataURL with
// noise, and the cards showed stripes. Drawing one canvas onto another is
// not a read, so nothing is withheld.
export async function renderStlThumbnail(
  data: ArrayBuffer,
  orientation: Orientation,
  color: string,
): Promise<HTMLCanvasElement> {
  const plywood = await picture(PLYWOOD_PICTURE);
  const geometry = holdGeometry(data, orientation);
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    side: DoubleSide,
  });
  const tableTexture = textureOf(plywood);
  const boardTexture = textureOf(plywood);
  const tableGeometry = new PlaneGeometry(1, 1);
  const tableMaterial = new MeshStandardMaterial({
    color: tableTexture ? PLYWOOD_TINT : TABLE_COLOR,
    map: tableTexture,
    roughness: 0.9,
    // The hold's flat back lies in the table's own plane; this lets the
    // hold win there instead of flickering through.
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const boardMaterial = new MeshStandardMaterial({
    color: boardTexture ? PLYWOOD_TINT : BOARD_COLOR,
    map: boardTexture,
    roughness: 0.9,
  });
  let renderer: WebGLRenderer | undefined;
  try {
    renderer = new WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(WIDTH, HEIGHT);
    renderer.setClearColor(BOARD_COLOR);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    const scene = new Scene();
    const hold = new Mesh(geometry, material);
    hold.castShadow = true;
    scene.add(hold);

    const { up } = HOLD_FRAME;
    const direction = getStlViewDirection(HOLD_FRAME, "side")
      .addScaledVector(up, CAMERA_LIFT)
      .normalize();
    const aspect = WIDTH / HEIGHT;
    const { target, halfHeight } = fitStlCamera(
      geometry,
      direction,
      up,
      aspect,
    );
    const halfAngle = (FIELD_OF_VIEW * Math.PI) / 360;
    const distance = halfHeight / HOLD_SHARE / Math.tan(halfAngle);
    const camera = new PerspectiveCamera(
      FIELD_OF_VIEW,
      aspect,
      distance / 50,
      distance * 12,
    );
    camera.up.copy(up);
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);

    // The table: the hold's flat back lies on Z = 0. It runs from behind
    // the camera to the board a little past the hold.
    const away = new Vector3(-direction.x, -direction.y, 0).normalize();
    const elevation = Math.asin(direction.z);
    const edgeDrop = elevation - (BOARD_FOOT_RISE * Math.PI) / 180;
    const toEdge = camera.position.z / Math.tan(edgeDrop);
    const length = toEdge + distance / 2;
    const width = distance * 4;
    const table = new Mesh(tableGeometry, tableMaterial);
    table.scale.set(width, length, 1);
    table.position
      .set(camera.position.x, camera.position.y, 0)
      .addScaledVector(away, toEdge - length / 2);
    table.rotation.z = Math.atan2(away.y, away.x) - Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);

    // The board: upright along the table's far edge, facing the camera and
    // taller than the picture.
    const height = distance * 3;
    const board = new Mesh(tableGeometry, boardMaterial);
    board.scale.set(width, height, 1);
    board.position
      .set(camera.position.x, camera.position.y, height / 2)
      .addScaledVector(away, toEdge);
    const facing = away.clone().negate();
    board.quaternion.setFromRotationMatrix(
      new Matrix4().makeBasis(
        new Vector3().crossVectors(up, facing),
        up,
        facing,
      ),
    );
    board.receiveShadow = true;
    scene.add(board);

    const radius = geometry.boundingSphere?.radius ?? halfHeight;
    const { least, most, typical } = HOLD_RADIUS_MM;
    const unit = radius < least || radius > most ? radius / typical : 1;
    // Rows of holes are a quarter of a tile apart. Each sheet is slid so the
    // corner where they meet falls midway between two rows, not through one:
    // the table ends there, the board starts there.
    const betweenRows = 0.125;
    const sheets: [Texture | null, number, boolean][] = [
      [tableTexture, length, true],
      [boardTexture, height, false],
    ];
    for (const [texture, extent, endsAtCorner] of sheets) {
      if (!texture) continue;
      texture.wrapS = texture.wrapT = MirroredRepeatWrapping;
      texture.repeat.set(
        width / (TABLE_TILE_MM.width * unit),
        extent / (TABLE_TILE_MM.height * unit),
      );
      texture.offset.y = betweenRows - (endsAtCorner ? texture.repeat.y : 0);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }

    scene.add(new HemisphereLight(0xffffff, 0x9a8a76, 1.25));
    // The shop light: above, a little toward the camera and to its left, so
    // the hold's shadow falls on the table beside and behind it.
    const side = new Vector3().crossVectors(up, direction).normalize();
    const reach = geometry.boundingSphere?.radius ?? halfHeight;
    const light = new DirectionalLight(0xfff1dd, 2.7);
    light.position
      .copy(target)
      .addScaledVector(up, reach * 5)
      .addScaledVector(direction, reach * 2.2)
      .addScaledVector(side, -reach * 2.6);
    light.target.position.copy(target);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.radius = 8;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = reach * 0.01;
    const shade = light.shadow.camera;
    shade.left = shade.bottom = -reach * 2.4;
    shade.right = shade.top = reach * 2.4;
    shade.near = reach * 0.5;
    shade.far = reach * 12;
    scene.add(light, light.target);
    const fill = new DirectionalLight(0xdfe8ff, 0.9);
    fill.position.copy(direction).addScaledVector(side, 1.2);
    scene.add(fill);

    renderer.render(scene, camera);
    if (renderer.getContext().isContextLost())
      throw new Error("The graphics context is unavailable.");
    const result = document.createElement("canvas");
    result.width = WIDTH;
    result.height = HEIGHT;
    const context = result.getContext("2d");
    if (!context) throw new Error("The graphics context is unavailable.");
    context.drawImage(renderer.domElement, 0, 0);
    // A lens darkens toward its corners; so does this picture, a little.
    const corners = context.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      HEIGHT * 0.45,
      WIDTH / 2,
      HEIGHT / 2,
      WIDTH * 0.72,
    );
    corners.addColorStop(0, "rgb(20 12 6 / 0)");
    corners.addColorStop(1, "rgb(20 12 6 / 0.3)");
    context.fillStyle = corners;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    return result;
  } finally {
    geometry.dispose();
    material.dispose();
    tableGeometry.dispose();
    tableMaterial.dispose();
    boardMaterial.dispose();
    tableTexture?.dispose();
    boardTexture?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
