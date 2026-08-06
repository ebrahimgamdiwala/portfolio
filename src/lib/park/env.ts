import {
  BackSide,
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { applySky, makeSkyMaterial, type SkyState, type SkyUniforms } from "./sky";

/**
 * The environment map, prefiltered from the same sky the dome uses.
 *
 * This is the least glamorous file in the project and the one doing the most
 * work for realism: without an environment, `metalness: 1` steel has nothing to
 * reflect and reads as flat grey plastic. With it, every rail, gantry and
 * painted panel picks up the sky above and the dark ground below, which is most
 * of what separates "photographed" from "rendered".
 *
 * Prefiltering is far too expensive per frame, so the rig rebuilds only when
 * the sky has moved a meaningful amount — see `Scene.tsx`.
 */
export class EnvRig {
  private pmrem: PMREMGenerator;
  private scene = new Scene();
  private uniforms: SkyUniforms;
  private target: WebGLRenderTarget | null = null;
  private ground: Mesh<CircleGeometry, MeshBasicMaterial>;

  constructor(renderer: WebGLRenderer) {
    this.pmrem = new PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    const { material, uniforms } = makeSkyMaterial();
    this.uniforms = uniforms;
    material.side = BackSide;
    this.scene.add(new Mesh(new SphereGeometry(12, 32, 20), material));

    // A dark floor under the dome. Skip it and metal reflects sky from below,
    // which instantly looks wrong on anything standing on tarmac.
    this.ground = new Mesh(
      new CircleGeometry(12, 32),
      new MeshBasicMaterial({ color: new Color("#0a0c12") }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.6;
    this.scene.add(this.ground);
  }

  /** Prefilters the current sky and returns the map to assign to `scene.environment`. */
  build(state: SkyState): Texture {
    applySky(this.uniforms, state, 0);
    // the ground picks up a little of the sky's own bounce
    this.ground.material.color.copy(state.fog).multiplyScalar(0.35);

    const next = this.pmrem.fromScene(this.scene, 0.035, 0.1, 60);
    this.target?.dispose();
    this.target = next;
    return next.texture;
  }

  dispose() {
    this.target?.dispose();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose?.();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}
