# info crafting
version: 1.0.0
pack: skills
dependencies:
  core
  cooking

# stat crafting
title: Crafting
base: 30
group: core.skilling

# skill crafting
title: Crafting
stat: crafting

# item leather
title: Leather
examine: Tanned, trimmed square, and it still curls at the corners if you leave it alone.
value: 20

# item sinew
title: Sinew
examine: Dried and split into threads. It goes stiff in the cold and holds anything.
value: 6

# item wolfskin
title: Wolfskin
examine: A pelt cured with the guard hairs left on, which is the whole point of a wolfskin.
value: 40

# item quill
title: Quill
examine: A cut feather. Fletchers want them by the hundred and so, it turns out, does anybody making a line.
value: 2

# item leather-coif
title: Leather Coif
examine: A hood of it, laced under the chin, and it will stop precisely one thing once.
slot: head
value: 22
item-level: 1-3
armour, +1 core.defense, +2 core.max-health

# item leather-body
title: Leather Body
examine: A hardened jerkin. Cheap, quiet, and it does not rust in the sewer.
slot: body
value: 34
item-level: 2-5
armour, +2 core.defense, +1 core.max-health

# item leather-chaps
title: Leather Chaps
examine: Over the knee and laced at the back, and every wolf in the pinewood has been through a pair.
slot: legs
value: 28
item-level: 2-4
armour, +2 core.defense

# item leather-gloves
title: Leather Gloves
examine: Close-cut, thin at the fingers, made by somebody who had to keep working in them.
slot: gloves
value: 24
item-level: 1-3
armour, +1 core.defense, +1 core.max-health

# item wolfskin-gloves
title: Wolfskin Gloves
examine: Fur to the wrist and leather in the palm. Nothing you do in these is quick, and nothing you do in these is cold.
slot: gloves
requires: level.crafting >= 15
value: 90
item-level: 4-8
armour, +2 core.defense, +4 core.max-health

# item cowhide
title: Cowhide
examine: A whole hide, folded hair-in. The tanners take these by the cart.
value: 12

# item wolf-pelt
title: Wolf Pelt
examine: Grey through to the roots, and it still smells of the pines.
value: 22

# item feather
title: Feather
examine: One brown feather. Nobody has ever wanted just one.
value: 1

# recipe leather
in: 1 crafting.cowhide
out: 1 leather
skill: crafting 18
rate: crafting
say: You scrape the hide down, work it soft, and cut what is left square.

# recipe sinew
in: 1 cooking.raw-beef
out: 2 sinew
skill: crafting 10
rate: crafting
say: You strip the sinew out along the grain of the meat and hang it to dry.

# recipe wolfskin
in: 1 crafting.wolf-pelt
out: 1 wolfskin
skill: crafting 30
rate: crafting
say: The guard hairs stay on, which means the whole thing has to be cured twice.

# recipe quill
in: 3 crafting.feather
out: 1 quill
skill: crafting 4
rate: crafting
say: You strip and square the feather down to the shaft.

# recipe leather-coif
in: 1 leather, 1 sinew
out: 1 leather-coif
skill: crafting 26
rate: crafting
say: You lace it under the chin and it fits nobody, which is normal.

# recipe leather-gloves
in: 1 leather, 2 sinew
out: 1 leather-gloves
skill: crafting 34
rate: crafting
say: Four fingers and a thumb, and the thumb takes as long as the fingers.

# recipe leather-chaps
in: 2 leather, 2 sinew
out: 1 leather-chaps
skill: crafting 46
rate: crafting
say: You cut them long and lace them at the back, because that is where the wolf is not.

# recipe leather-body
in: 3 leather, 3 sinew
out: 1 leather-body
skill: crafting 62
rate: crafting
say: Hardened in wax, and it takes the shape of whoever is standing in it when it cools.

# recipe wolfskin-gloves
in: 2 wolfskin, 1 leather, 2 sinew
out: 1 wolfskin-gloves
skill: crafting 120
rate: crafting
say: Fur out, leather in the palm, and the seam hidden along the side of the finger.
