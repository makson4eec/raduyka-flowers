"use client";

import Image from "next/image";

import { getProductImages } from "../../lib/product-images";
import { optimizedImageSource } from "../../lib/image-assets";
import type { Product } from "../../lib/types";

export default function ProductPhotos({ product, uploading, onUpload, onRemove }: {
  product: Product;
  uploading: boolean;
  onUpload: (file: File, index: number) => void;
  onRemove: (index: number) => void;
}) {
  const variantCover = product.kind === "flower" && product.variants[0]?.image;
  const images = getProductImages({ ...product, image: variantCover || product.image });
  return <div className="admin-product-photos">
    {[0, 1, 2].map((index) => <div className="admin-photo-slot" key={index}>
      {images[index] ? <Image unoptimized width={180} height={150} src={optimizedImageSource(images[index])} alt={`Фото товара ${index + 1}`} /> : <div className="admin-photo-empty">Нет фото</div>}
      <b>{index === 0 ? "Основное фото" : `Фото ${index + 1}`}</b>
      {index === 0 && variantCover ? <small>Фото основного цвета. Меняется в блоке «Цвета в карточке».</small> : <label className="admin-secondary">{uploading ? "Загружаем…" : images[index] ? "Заменить фото" : "Добавить фото"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => {
        const file = e.target.files?.[0]; e.currentTarget.value = "";
        if (file) onUpload(file, index);
      }} /></label>}
      {index > 0 && images[index] && <button type="button" className="is-danger" disabled={uploading} onClick={() => onRemove(index)}>Удалить фото</button>}
    </div>)}
    <small className="admin-photo-hint">До 3 фотографий товара. JPG, PNG или WebP, до 5 МБ каждая.</small>
  </div>;
}
