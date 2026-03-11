import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS } from '../styles';
import '../fonts';

interface ConsultantCardProps {
  nombre: string;
  titulo: string;
  bio: string;
  fotoPath?: string;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#252525',
    borderRadius: 6,
    padding: 14,
    marginHorizontal: 4,
  },
  photoContainer: {
    marginBottom: 10,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 6,
    objectFit: 'cover',
  },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 6,
    backgroundColor: COLORS.grayDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderStyle: 'solid',
  },
  photoPlaceholderText: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 20,
  },
  goldAccentBar: {
    width: 30,
    height: 2,
    backgroundColor: COLORS.gold,
    marginBottom: 8,
  },
  name: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 11,
    marginBottom: 3,
    lineHeight: 1.3,
  },
  titulo: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8.5,
    lineHeight: 1.3,
    marginBottom: 8,
  },
  bio: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8.5,
    lineHeight: 1.55,
    opacity: 0.85,
  },
});

// Get initials from name for placeholder
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function ConsultantCard({ nombre, titulo, bio, fotoPath }: ConsultantCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.photoContainer}>
        {fotoPath ? (
          <Image src={fotoPath} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderText}>{getInitials(nombre)}</Text>
          </View>
        )}
      </View>

      <View style={styles.goldAccentBar} />
      <Text style={styles.name}>{nombre}</Text>
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.bio}>{bio}</Text>
    </View>
  );
}
