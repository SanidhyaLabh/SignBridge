import kagglehub, os, cv2
path = kagglehub.dataset_download('kshitij192/isl-dataset')

# Navigate to actual train data
train_dir = None
for root, dirs, files in os.walk(path):
    if 'train' in dirs:
        train_dir = os.path.join(root, 'train')
        break

print('Train dir:', train_dir)
classes = sorted(os.listdir(train_dir))
print('Classes:', classes)
print('Num classes:', len(classes))

# Check images from several classes
for cls in ['a', 'b', 'l', 'y', '0', '5']:
    cls_dir = os.path.join(train_dir, cls)
    if os.path.exists(cls_dir):
        all_files = os.listdir(cls_dir)
        imgs = [f for f in all_files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
        if imgs:
            img_path = os.path.join(cls_dir, imgs[0])
            img = cv2.imread(img_path)
            if img is not None:
                print(f"  {cls}: shape={img.shape}, files={len(imgs)}, sample={imgs[0]}")
                # Check if grayscale
                if len(img.shape) == 2:
                    print(f"    -> GRAYSCALE image")
                elif img.shape[2] == 1:
                    print(f"    -> SINGLE CHANNEL")
                else:
                    gray_check = (img[:,:,0] == img[:,:,1]).all() and (img[:,:,1] == img[:,:,2]).all()
                    print(f"    -> {'GRAYSCALE(3ch)' if gray_check else 'COLOR'}")
            else:
                print(f"  {cls}: cv2.imread returned None for {img_path}")
        else:
            print(f"  {cls}: no image files, has: {all_files[:3]}")
