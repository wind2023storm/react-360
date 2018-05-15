/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

import * as THREE from 'three';

type ShapeType = 'Cylinder' | 'Flat';

export const SurfaceShape: {[key: ShapeType]: ShapeType} = {
  Cylinder: 'Cylinder',
  Flat: 'Flat',
};

const DEFAULT_DENSITY = 4680;
const DEFAULT_RADIUS = 4;

/**
 * Surface is an object used to place 2D layers in 3D space. It is optimized
 * for the resolution of that surface, and allows developers to think in pixels
 * instead of spatial coordinates. A surface is defined in terms of pixel size
 * and angular density, and the geometry is generated accordingly.
 * Surfaces are available in the following shapes:
 *  - Cylinder, places UI content on the inside of a cylinder wrapped around
 *    the user. This means that every pixel on the surface will be viewed
 *    straight-on, and not from an angled perspective.
 *    The default Cylinder has a radius of 4 meters, and a density of 4680px
 *    per 2π radians.
 *    NOTE: Due to WebGL 1.0 restrictions, the maximum width is 4096, so you
 *    need to reduce the density to create a UI that wraps all the way around.
 *  - Flat, places UI content on a quadrilateral panel. The panel is positioned
 *    tangent to a sphere, meaning that the center point will always be viewed
 *    straight-on. The position of the panel on the outside of the sphere is
 *    determined through yaw (rotation around the y axis) and pitch (rotation
 *    around the x axis) angles. Yaw rotation will move it horizontally around
 *    the sphere, and pitch rotation will move it vertically between the ground
 *    and the ceiling. The default sphere radius is 4 meters.
 * It is possible to re-shape a Surface without destroying it, allowing a main
 * React surface to be dynamically reshaped depending on the contents. Calling
 */
export default class Surface {
  _density: number;
  _height: number;
  _pitch: number;
  _radius: number;
  _shape: ShapeType;
  _width: number;
  _yaw: number;
  // Three.js properties
  _camera: THREE.Camera;
  _geometry: THREE.Geometry;
  _material: THREE.Material;
  _mesh: THREE.Mesh;
  _renderTarget: THREE.WebGLRenderTarget;
  _subScene: THREE.Scene;

  constructor(
    width: number,
    height: number,
    shape: ShapeType = SurfaceShape.Cylinder,
  ) {
    this._width = width;
    this._height = height;
    this._density = DEFAULT_DENSITY;
    this._radius = DEFAULT_RADIUS;
    this._shape = shape;
    this._yaw = 0;
    this._pitch = 0;

    this._material = new THREE.MeshBasicMaterial({
      wireframe: false,
      transparent: true,
      premultipliedAlpha: true,
      color: 'white',
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
    });
    this._camera = new THREE.OrthographicCamera();
    this._subScene = new THREE.Scene();
    this._subScene.scale.y = -1;

    this._renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    this._material.map = this._renderTarget.texture;

    this._regenerateGeometry();
    this._mesh = new THREE.Mesh(this._geometry, this._material);
    (this._mesh: any).subScene = this._subScene;
    (this._mesh: any).subSceneCamera = this._camera;
    this._mesh.scale.z = -1;
    this.resize(width, height);
  }

  /**
   * Set the pixel density of the surface, resizing the geometry as necessary.
   */
  setDensity(density: number) {
    if (density < 0) {
      throw new Error('Surface density cannot be negative');
    }
    this._density = density;
    this._regenerateGeometry();
  }

  /**
   * Set the radius of the cylinder or sphere used to position the surface,
   * and reposition it.
   */
  setRadius(radius: number) {
    if (radius < 0) {
      throw new Error('Surface radius cannot be negative');
    }
    this._radius = radius;
    if (this._shape === SurfaceShape.Cylinder) {
      this._regenerateGeometry();
    } else if (this._shape === SurfaceShape.Flat) {
      this._recomputeOrientation();
    }
  }

  /**
   * Change the shape of the surface, using a value from the SurfaceShape export
   */
  setShape(shape: ShapeType) {
    if (this._shape === shape) {
      return;
    }
    this._shape = shape;
    this._regenerateGeometry();
    this._recomputeOrientation();
  }

  /**
   * Set the angle of a Flat panel, positioned on the outside of a sphere.
   * The yaw angle moves the panel horizontally around the sphere within the
   * x-y plane; the pitch angle moves the panel vertically between the floor
   * and the ceiling.
   */
  setAngle(yaw: number, pitch: number) {
    this._yaw = yaw;
    this._pitch = pitch;
    this._recomputeOrientation();
  }

  /**
   * Change the opacity of the surface and its contents
   */
  setOpacity(opacity: number) {
    if (opacity < 0 || opacity > 1) {
      throw new Error('Surface opacity must be between 0.0 and 1.0');
    }
    this._material.opacity = opacity;
  }

  /**
   * Determine whether the surface is visible or not
   */
  setVisibility(visible: boolean) {
    this._mesh.visible = visible;
  }

  getWidth(): number {
    return this._width;
  }

  getHeight(): number {
    return this._height;
  }

  getScene(): THREE.Scene {
    return this._subScene;
  }

  getCamera(): THREE.Camera {
    return this._camera;
  }

  getRenderTarget(): THREE.WebGLRenderTarget {
    return this._renderTarget;
  }

  getNode(): THREE.Object3D {
    return this._mesh;
  }

  /**
   * Change the pixel dimensions of the surface, recomputing the geometry to
   * maintain the density.
   */
  resize(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._renderTarget.setSize(width, height);
    this._material.needsUpdate = true;
    this._camera.left = 0;
    this._camera.right = width;
    this._camera.top = 0;
    this._camera.bottom = height;
    this._camera.near = -1000;
    this._camera.far = 1000;
    this._camera.setViewOffset(width, height, 0, 0, width, height);
    this._camera.updateProjectionMatrix();
    (this._subScene: any)._rttWidth = width;
    (this._subScene: any)._rttHeight = height;
    this._regenerateGeometry();
  }

  /**
   * Rebuild the surface geometry anytime the dimensions or shape change.
   */
  _regenerateGeometry() {
    if (this._geometry) {
      this._geometry.dispose();
    }
    if (this._shape === SurfaceShape.Cylinder) {
      this._geometry = Surface.createCylinderGeometry(
        this._width,
        this._height,
        this._density,
        this._radius,
      );
    } else if (this._shape === SurfaceShape.Flat) {
      this._geometry = Surface.createFlatGeometry(
        this._width,
        this._height,
        this._density,
        this._radius,
      );
    }
    if (this._mesh) {
      this._mesh.geometry = this._geometry;
      this._mesh.needsUpdate = true;
    }
  }

  /**
   * Recompute the position and rotation of the surface after any rotation or
   * shape changes.
   * Cylinders are always positioned at 0,0,0 with no rotation.
   * Flat surfaces are oriented on the outside of a sphere, so we compute the
   * position of the surface's center, and then build the rotation quaternion.
   */
  _recomputeOrientation() {
    if (this._shape === SurfaceShape.Cylinder) {
      if (this._mesh) {
        this._mesh.quaternion.set(0, 0, 0, 1);
        this._mesh.position.set(0, 0, 0);
      }
    } else if (this._shape === SurfaceShape.Flat) {
      // Flat surfaces are oriented tangent to a sphere
      let z = Math.cos(this._pitch) * this._radius;
      const y = Math.sin(this._pitch) * this._radius;
      const x = Math.sin(this._yaw) * z;
      z *= Math.cos(this._yaw);
      this._mesh.position.set(x, y, -z);
      const sp = Math.sin(this._pitch / 2);
      const cp = Math.cos(this._pitch / 2);
      const sy = Math.sin(-this._yaw / 2);
      const cy = Math.cos(-this._yaw / 2);
      this._mesh.quaternion.set(cy * sp, sy * cp, -sy * sp, cy * cp);
    }
  }

  /**
   * Build a partial cylinder geometry for a given size, density, and radius.
   * The geometry will only build the arc needed to create a surface of the
   * proper size.
   */
  static createCylinderGeometry(
    width: number,
    height: number,
    density: number,
    radius: number,
  ) {
    const delta = 2 * Math.PI * width / density;
    const halfHeight = radius * Math.PI * height / density;
    return new THREE.CylinderGeometry(
      radius,
      radius,
      halfHeight * 2,
      60,
      6,
      true,
      -delta * 0.5,
      delta,
    );
  }

  /**
   * Build a planar geometry for a given size, density, and distance from the
   * user.
   */
  static createFlatGeometry(
    width: number,
    height: number,
    density: number,
    radius: number,
  ) {
    const halfWidth = radius * Math.PI * width / density;
    const halfHeight = radius * Math.PI * height / density;
    return new THREE.PlaneGeometry(halfWidth * 2, halfHeight * 2, 1, 1);
  }

  static SurfaceShape = SurfaceShape;
}
