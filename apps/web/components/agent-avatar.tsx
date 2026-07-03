import Avatar from "boring-avatars";

interface AgentAvatarProps {
  name: string;
  id: string;
  size?: number;
}

export function AgentAvatar({ name, id, size = 36 }: AgentAvatarProps) {
  return (
    <Avatar
      name={`${name}${id}`}
      size={size}
      variant="pixel"
      colors={["#92A1C6", "#146A7C", "#F0AB3D", "#C271B4", "#C20D90"]}
    />
  );
}
