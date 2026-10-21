// Shows a 3D model (IFC or GLB / glTF) in a container: orbit with the mouse or a finger, zoom, pan.
// three.js and web-ifc are large, so they are loaded only when a model is opened.
// The background stays light in dark mode too, so models look the way architects export them.

const BG = 0xeef0f3;

async function readIfc(THREE, url) {
  const [{ IfcAPI }, { default: wasm }] = await Promise.all([import('web-ifc'), import('web-ifc/web-ifc.wasm?url')]);
  const api = new IfcAPI();
  // Single-threaded: the multi-threaded build needs headers the site does not send
  await api.Init((path) => (path.endsWith('.wasm') ? wasm : path), true);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const id = api.OpenModel(new Uint8Array(await res.arrayBuffer()), { COORDINATE_TO_ORIGIN: true });
  const group = new THREE.Group();
  const materials = new Map();
  const material = ({ x, y, z, w }) => {
    const key = `${x},${y},${z},${w}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshLambertMaterial({
        color: new THREE.Color(x, y, z), transparent: w < 1, opacity: w, side: THREE.DoubleSide, depthWrite: w >= 1,
      }));
    }
    return materials.get(key);
  };
  try {
    api.StreamAllMeshes(id, (mesh) => {
      const placed = mesh.geometries;
      for (let i = 0; i < placed.size(); i++) {
        const p = placed.get(i);
        const g = api.GetGeometry(id, p.geometryExpressID);
        // Vertex data is position and normal, interleaved (6 numbers a vertex)
        const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const index = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const buf = new THREE.InterleavedBuffer(new Float32Array(verts), 6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buf, 3, 0));
        geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(buf, 3, 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
        const m = new THREE.Mesh(geo, material(p.color));
        m.matrixAutoUpdate = false;
        m.matrix.fromArray(p.flatTransformation);
        group.add(m);
        g.delete();
      }
    });
  } finally {
    api.CloseModel(id);
  }
  return group;
}

async function readGltf(url) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

// Returns { resetView, dispose }. Throws when the file can't be read.
export async function loadModel(container, model) {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const object = model.kind === 'ifc' ? await readIfc(THREE, model.file) : await readGltf(model.file);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);
  scene.add(object);
  object.updateMatrixWorld(true);

  // Frame the model: stand off by its size, looking at its centre, on a grid at its base
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) throw new Error('The model has nothing to show');
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z) || 1;
  const grid = new THREE.GridHelper(span * 2, 20, 0xc9ced6, 0xdde1e7);
  grid.position.set(centre.x, box.min.y, centre.z);
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(45, 1, span / 1000, span * 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const home = () => {
    camera.position.set(centre.x + span * 0.8, centre.y + span * 0.55, centre.z + span * 0.8);
    controls.target.copy(centre);
    controls.update();
  };
  home();

  const fit = () => {
    const w = container.clientWidth || 1; const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  const resize = new ResizeObserver(fit);
  resize.observe(container);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  return {
    resetView: home,
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        [].concat(o.material || []).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
